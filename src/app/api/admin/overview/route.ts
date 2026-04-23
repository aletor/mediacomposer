import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore } from "@/lib/json-persistence";
import { getUsageDeepReportSince } from "@/lib/api-usage";
import { getApiServiceControls } from "@/lib/api-usage-controls";
import { USAGE_PERIOD_START_ISO } from "@/lib/usage-constants";
import { collectS3KeysFromProjectSpaces } from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

export const runtime = "nodejs";

const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";
const KNOWLEDGE_PREFIX = "knowledge-files/";
const LIST_MAX_KEYS = 1000;
const SESSION_GAP_MS = 45 * 60 * 1000;
const SESSION_BASE_MINUTES = 5;
const SESSION_GAP_CAP_MINUTES = 90;
const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const CALENDAR_DAYS = 42;

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

type AdminUser = {
  email: string;
  name: string | null;
  image: string | null;
  projectCount: number;
  fileCount: number;
  totalBytes: number;
  nodeCount: number;
  lastActiveAt: string | null;
  sessionCount: number;
  estimatedMinutes: number;
};

type AdminProject = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string | null;
  ownerImage: string | null;
  createdAt: string;
  updatedAt: string;
  spacesCount: number;
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  totalBytes: number;
  topNodeTypes: Array<{ type: string; count: number }>;
};

type AdminNodeUsage = {
  type: string;
  count: number;
  projectCount: number;
  userCount: number;
};

type AdminFlowUsage = {
  from: string;
  to: string;
  count: number;
};

type AdminFile = {
  key: string;
  name: string;
  folder: string;
  type: string;
  size: number;
  lastModified: string | null;
  spaceId: string | null;
  projectIds: string[];
  projectNames: string[];
  ownerEmails: string[];
  orphan: boolean;
};

type AdminCalendarDay = {
  day: string;
  activeUsers: number;
  events: number;
  sessions: number;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

function isAdminUser(email: string): boolean {
  const configured = (
    process.env.FOLDDER_ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);

  if (configured.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return configured.includes(email);
}

function devBypassAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return req.headers.get("x-foldder-dev-passcode") === "6666";
}

async function ensureAdmin(req: NextRequest): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  if (devBypassAllowed(req)) return { ok: true };
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminUser(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

async function readProjects(): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    return readAllDdbProjectsStore(spacesTableName());
  }
  return readJsonStore(spacesStore);
}

async function listAllKnowledgeObjects(): Promise<
  Array<{ key: string; size: number; lastModified: string | null }>
> {
  const out: Array<{ key: string; size: number; lastModified: string | null }> =
    [];
  let token: string | undefined;

  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: KNOWLEDGE_PREFIX,
        ContinuationToken: token,
        MaxKeys: LIST_MAX_KEYS,
      }),
    );
    for (const row of res.Contents ?? []) {
      if (!row.Key) continue;
      out.push({
        key: row.Key,
        size: Number(row.Size ?? 0),
        lastModified: row.LastModified ? row.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

function getTypeFromKey(key: string): string {
  const filename = key.split("/").pop() || key;
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "unknown";
  return filename.slice(idx + 1).toLowerCase();
}

function getSpaceIdFromKey(key: string): string | null {
  const m = key.match(/^knowledge-files\/spaces\/([^/]+)\//);
  return m?.[1] ?? null;
}

function estimateSessionsAndMinutes(isoDates: string[]): {
  sessionCount: number;
  estimatedMinutes: number;
} {
  const sorted = isoDates
    .map((v) => new Date(v).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return { sessionCount: 0, estimatedMinutes: 0 };

  let sessions = 1;
  let minutes = SESSION_BASE_MINUTES;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > SESSION_GAP_MS) {
      sessions += 1;
      minutes += SESSION_BASE_MINUTES;
    } else {
      minutes += Math.min(
        SESSION_GAP_CAP_MINUTES,
        Math.max(1, Math.round(gap / 60000)),
      );
    }
  }
  return { sessionCount: sessions, estimatedMinutes: minutes };
}

export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdmin(req);
    if (!guard.ok) return guard.response;

    const [projects, s3Objects, apiUsage, apiControls] = await Promise.all([
      readProjects(),
      listAllKnowledgeObjects(),
      getUsageDeepReportSince(USAGE_PERIOD_START_ISO),
      getApiServiceControls(),
    ]);

    const projectNameById = new Map<string, string>();
    const projectOwnerById = new Map<string, string>();
    const projectIdsBySpaceId = new Map<string, Set<string>>();
    const projectIdsByReferencedKey = new Map<string, Set<string>>();

    const projectNodeCountById = new Map<string, number>();
    const projectEdgeCountById = new Map<string, number>();
    const projectNodeTypeCountById = new Map<string, Map<string, number>>();
    const nodeUsageByType = new Map<
      string,
      { count: number; projects: Set<string>; users: Set<string> }
    >();
    const flowUsage = new Map<string, number>();

    for (const project of projects) {
      const ownerEmail = normalizeEmail(project.ownerUserEmail) || "unknown@local";
      projectNameById.set(project.id, project.name);
      projectOwnerById.set(project.id, ownerEmail);

      const nodeTypeMap = new Map<string, number>();
      let nodesTotal = 0;
      let edgesTotal = 0;

      for (const [spaceId, space] of Object.entries(project.spaces || {})) {
        if (spaceId && spaceId !== "root") {
          const bucket = projectIdsBySpaceId.get(spaceId) ?? new Set<string>();
          bucket.add(project.id);
          projectIdsBySpaceId.set(spaceId, bucket);
        }

        const nodes = Array.isArray(space.nodes) ? space.nodes : [];
        const edges = Array.isArray(space.edges) ? space.edges : [];

        nodesTotal += nodes.length;
        edgesTotal += edges.length;

        const typeByNodeId = new Map<string, string>();
        for (const node of nodes as Array<{ id?: string; type?: string }>) {
          const type = node.type || "unknown";
          const id = node.id || "";
          if (id) typeByNodeId.set(id, type);
          nodeTypeMap.set(type, (nodeTypeMap.get(type) ?? 0) + 1);
          const usage = nodeUsageByType.get(type) ?? {
            count: 0,
            projects: new Set<string>(),
            users: new Set<string>(),
          };
          usage.count += 1;
          usage.projects.add(project.id);
          usage.users.add(ownerEmail);
          nodeUsageByType.set(type, usage);
        }

        for (const edge of edges as Array<{ source?: string; target?: string }>) {
          const from = edge.source ? typeByNodeId.get(edge.source) || "unknown" : "unknown";
          const to = edge.target ? typeByNodeId.get(edge.target) || "unknown" : "unknown";
          const key = `${from}=>${to}`;
          flowUsage.set(key, (flowUsage.get(key) ?? 0) + 1);
        }
      }

      projectNodeCountById.set(project.id, nodesTotal);
      projectEdgeCountById.set(project.id, edgesTotal);
      projectNodeTypeCountById.set(project.id, nodeTypeMap);

      for (const key of collectS3KeysFromProjectSpaces(project.spaces || {})) {
        const bucket = projectIdsByReferencedKey.get(key) ?? new Set<string>();
        bucket.add(project.id);
        projectIdsByReferencedKey.set(key, bucket);
      }
    }

    const files: AdminFile[] = s3Objects.map((row) => {
      const ids = new Set<string>(projectIdsByReferencedKey.get(row.key) ?? []);
      const spaceId = getSpaceIdFromKey(row.key);
      if (spaceId && spaceId !== "orphan") {
        for (const pid of projectIdsBySpaceId.get(spaceId) ?? []) ids.add(pid);
      }
      const projectIds = [...ids];
      const ownerEmails = [...new Set(projectIds.map((pid) => projectOwnerById.get(pid) || "unknown@local"))];
      return {
        key: row.key,
        name: row.key.split("/").pop() || row.key,
        folder: row.key.includes("/") ? row.key.slice(0, row.key.lastIndexOf("/")) : "(raíz)",
        type: getTypeFromKey(row.key),
        size: row.size,
        lastModified: row.lastModified,
        spaceId,
        projectIds,
        projectNames: projectIds.map((pid) => projectNameById.get(pid) || pid),
        ownerEmails,
        orphan: projectIds.length === 0,
      };
    });

    const fileBytesByProjectId = new Map<string, number>();
    const fileCountByProjectId = new Map<string, number>();
    for (const file of files) {
      for (const pid of file.projectIds) {
        fileBytesByProjectId.set(pid, (fileBytesByProjectId.get(pid) ?? 0) + file.size);
        fileCountByProjectId.set(pid, (fileCountByProjectId.get(pid) ?? 0) + 1);
      }
    }

    const adminProjects: AdminProject[] = projects
      .map((p) => {
        const typeMap = projectNodeTypeCountById.get(p.id) ?? new Map<string, number>();
        const topNodeTypes = [...typeMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([type, count]) => ({ type, count }));
        return {
          id: p.id,
          name: p.name,
          ownerEmail: normalizeEmail(p.ownerUserEmail) || "unknown@local",
          ownerName: p.ownerUserName ?? null,
          ownerImage: p.ownerUserImage ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          spacesCount: Object.keys(p.spaces || {}).length,
          nodeCount: projectNodeCountById.get(p.id) ?? 0,
          edgeCount: projectEdgeCountById.get(p.id) ?? 0,
          fileCount: fileCountByProjectId.get(p.id) ?? 0,
          totalBytes: fileBytesByProjectId.get(p.id) ?? 0,
          topNodeTypes,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const usersMap = new Map<
      string,
      {
        name: string | null;
        image: string | null;
        projects: AdminProject[];
        updatedAtList: string[];
        activityEvents: string[];
      }
    >();

    for (const p of adminProjects) {
      const row = usersMap.get(p.ownerEmail) ?? {
        name: p.ownerName,
        image: p.ownerImage,
        projects: [],
        updatedAtList: [],
        activityEvents: [],
      };
      row.projects.push(p);
      row.updatedAtList.push(p.updatedAt);
      row.activityEvents.push(p.updatedAt);
      row.activityEvents.push(p.createdAt);
      usersMap.set(p.ownerEmail, row);
    }

    const userFileStats = new Map<string, { count: number; bytes: number }>();
    for (const f of files) {
      for (const email of f.ownerEmails) {
        const row = userFileStats.get(email) ?? { count: 0, bytes: 0 };
        row.count += 1;
        row.bytes += f.size;
        userFileStats.set(email, row);
      }
    }

    const users: AdminUser[] = [...usersMap.entries()]
      .map(([email, row]) => {
        const sessions = estimateSessionsAndMinutes(row.activityEvents);
        const projectNodeCount = row.projects.reduce((acc, p) => acc + p.nodeCount, 0);
        const fs = userFileStats.get(email) ?? { count: 0, bytes: 0 };
        return {
          email,
          name: row.name,
          image: row.image,
          projectCount: row.projects.length,
          fileCount: fs.count,
          totalBytes: fs.bytes,
          nodeCount: projectNodeCount,
          lastActiveAt: row.activityEvents.sort((a, b) => b.localeCompare(a))[0] ?? null,
          sessionCount: sessions.sessionCount,
          estimatedMinutes: sessions.estimatedMinutes,
        };
      })
      .sort((a, b) => (b.lastActiveAt || "").localeCompare(a.lastActiveAt || ""));

    const nowTs = Date.now();
    const onlineUsers = users.filter((u) => {
      if (!u.lastActiveAt) return false;
      const ts = new Date(u.lastActiveAt).getTime();
      if (!Number.isFinite(ts)) return false;
      return nowTs - ts <= ONLINE_WINDOW_MS;
    });

    const dayMap = new Map<string, { users: Set<string>; events: number; sessions: number }>();
    for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { users: new Set<string>(), events: 0, sessions: 0 });
    }

    for (const [email, row] of usersMap.entries()) {
      const dayEvents = new Map<string, string[]>();
      for (const iso of row.activityEvents) {
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) continue;
        const key = new Date(ts).toISOString().slice(0, 10);
        if (!dayMap.has(key)) continue;
        const list = dayEvents.get(key) ?? [];
        list.push(iso);
        dayEvents.set(key, list);
        const slot = dayMap.get(key)!;
        slot.events += 1;
        slot.users.add(email);
      }
      for (const [key, dates] of dayEvents.entries()) {
        const sess = estimateSessionsAndMinutes(dates).sessionCount;
        const slot = dayMap.get(key);
        if (slot) slot.sessions += sess;
      }
    }

    const calendar: AdminCalendarDay[] = [...dayMap.entries()].map(([day, row]) => ({
      day,
      activeUsers: row.users.size,
      events: row.events,
      sessions: row.sessions,
    }));

    const nodeUsage: AdminNodeUsage[] = [...nodeUsageByType.entries()]
      .map(([type, row]) => ({
        type,
        count: row.count,
        projectCount: row.projects.size,
        userCount: row.users.size,
      }))
      .sort((a, b) => b.count - a.count);

    const flow: AdminFlowUsage[] = [...flowUsage.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split("=>");
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 120);

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const orphanFiles = files.filter((f) => f.orphan);
    const orphanBytes = orphanFiles.reduce((acc, f) => acc + f.size, 0);
    const estimatedMinutes = users.reduce((acc, u) => acc + u.estimatedMinutes, 0);
    const sessions = users.reduce((acc, u) => acc + u.sessionCount, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      apiUsage,
      apiControls: Object.values(apiControls),
      summary: {
        users: users.length,
        usersOnlineNow: onlineUsers.length,
        projects: adminProjects.length,
        files: files.length,
        orphanFiles: orphanFiles.length,
        totalBytes,
        orphanBytes,
        nodeInstances: nodeUsage.reduce((acc, n) => acc + n.count, 0),
        estimatedMinutes,
        sessions,
        apiCalls: apiUsage.totals.calls,
        apiCostUsd: apiUsage.totals.costUsd,
        apiTokens: apiUsage.totals.totalTokens,
      },
      onlineUsers,
      calendar,
      users,
      projects: adminProjects,
      nodeUsage,
      flow,
      files,
    });
  } catch (error) {
    console.error("[admin][overview] failed:", error);
    return NextResponse.json({ error: "Failed to build admin overview" }, { status: 500 });
  }
}
