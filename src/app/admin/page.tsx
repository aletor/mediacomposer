"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  FolderKanban,
  HardDrive,
  Power,
  RefreshCcw,
  Trash2,
  UserRound,
  Users,
  Waypoints,
} from "lucide-react";

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

type UsageByService = {
  serviceId: string;
  label: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

type UsageByUser = {
  userEmail: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

type UsageByProviderModel = {
  provider: string;
  model: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

type UsageByDay = {
  day: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
  uniqueUsers: number;
};

type ApiControl = {
  id: string;
  label: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

type OverviewResponse = {
  generatedAt: string;
  summary: {
    users: number;
    usersOnlineNow: number;
    projects: number;
    files: number;
    orphanFiles: number;
    totalBytes: number;
    orphanBytes: number;
    nodeInstances: number;
    estimatedMinutes: number;
    sessions: number;
    apiCalls: number;
    apiCostUsd: number;
    apiTokens: number;
  };
  apiUsage: {
    since: string;
    totals: { calls: number; costUsd: number; totalTokens: number };
    byService: UsageByService[];
    byUser: UsageByUser[];
    byProviderModel: UsageByProviderModel[];
    byDay: UsageByDay[];
  };
  apiControls: ApiControl[];
  onlineUsers: AdminUser[];
  calendar: AdminCalendarDay[];
  users: AdminUser[];
  projects: AdminProject[];
  nodeUsage: AdminNodeUsage[];
  flow: AdminFlowUsage[];
  files: AdminFile[];
};

type DeletePlan = {
  keys: string[];
  totalBytes: number;
};

type TabId = "overview" | "usage" | "storage";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatMoney(usd: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd || 0);
}

function CalendarHeatmap({ days }: { days: AdminCalendarDay[] }) {
  const maxUsers = Math.max(1, ...days.map((d) => d.activeUsers));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const intensity = d.activeUsers / maxUsers;
        const alpha = d.activeUsers === 0 ? 0.05 : 0.14 + intensity * 0.55;
        return (
          <div
            key={d.day}
            title={`${d.day} · activos: ${d.activeUsers} · sesiones: ${d.sessions} · eventos: ${d.events}`}
            className="aspect-square rounded-md border border-white/10"
            style={{ backgroundColor: `rgba(143,102,255,${alpha})` }}
          />
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showOrphansOnly, setShowOrphansOnly] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletePlan, setDeletePlan] = useState<DeletePlan | null>(null);
  const [devPasscode, setDevPasscode] = useState("");

  const apiHeaders = useMemo<Record<string, string>>(
    () => (devPasscode === "6666" ? { "x-foldder-dev-passcode": "6666" } : {}),
    [devPasscode],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview", {
        cache: "no-store",
        headers: apiHeaders,
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as OverviewResponse;
      setData(payload);
      setSelectedUser((prev) =>
        prev && payload.users.some((u) => u.email === prev)
          ? prev
          : payload.users[0]?.email ?? null,
      );
      setSelectedProject((prev) =>
        prev && payload.projects.some((p) => p.id === prev)
          ? prev
          : payload.projects[0]?.id ?? null,
      );
      setSelectedKeys(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando panel");
    } finally {
      setLoading(false);
    }
  }, [apiHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleApi = async (serviceId: string, enabled: boolean) => {
    setTogglingId(serviceId);
    setError(null);
    try {
      const res = await fetch("/api/admin/api-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ serviceId, enabled }),
      });
      const payload = (await res.json()) as { controls?: ApiControl[]; error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "No se pudo actualizar");
      setData((prev) =>
        prev
          ? {
              ...prev,
              apiControls: payload.controls || prev.apiControls,
            }
          : prev,
      );
      setNotice(`Servicio ${enabled ? "activado" : "bloqueado"}: ${serviceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando control de API");
    } finally {
      setTogglingId(null);
    }
  };

  const userFilteredProjects = useMemo(() => {
    if (!data) return [];
    if (!selectedUser) return data.projects;
    return data.projects.filter((p) => p.ownerEmail === selectedUser);
  }, [data, selectedUser]);

  const filteredFiles = useMemo(() => {
    if (!data) return [];
    const q = fileQuery.trim().toLowerCase();
    return data.files.filter((f) => {
      if (showOrphansOnly && !f.orphan) return false;
      if (selectedUser && !f.ownerEmails.includes(selectedUser) && !f.orphan) return false;
      if (selectedProject && !f.projectIds.includes(selectedProject) && !f.orphan) return false;
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.folder.toLowerCase().includes(q) ||
        f.ownerEmails.some((e) => e.toLowerCase().includes(q))
      );
    });
  }, [data, selectedUser, selectedProject, showOrphansOnly, fileQuery]);

  const selectedFiles = filteredFiles.filter((f) => selectedKeys.has(f.key));
  const selectedBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const selectedUserInfo = data?.users.find((u) => u.email === selectedUser) || null;
  const selectedProjectInfo = data?.projects.find((p) => p.id === selectedProject) || null;

  const openDeleteSelected = () => {
    if (selectedFiles.length === 0) return;
    setDeletePlan({
      keys: selectedFiles.map((f) => f.key),
      totalBytes: selectedBytes,
    });
  };

  const openDeleteOne = (file: AdminFile) => {
    setDeletePlan({ keys: [file.key], totalBytes: file.size });
  };

  const confirmDelete = async () => {
    if (!deletePlan) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/s3-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ keys: deletePlan.keys }),
      });
      const payload = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "No se pudo eliminar");
      setNotice(
        `Eliminados ${payload.deleted ?? deletePlan.keys.length} archivo(s). Liberado: ${formatBytes(deletePlan.totalBytes)}.`,
      );
      setDeletePlan(null);
      setSelectedKeys(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando archivos");
    } finally {
      setDeleting(false);
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: typeof BarChart3 }> = [
    { id: "overview", label: "Visión general", icon: BarChart3 },
    { id: "usage", label: "APIs y costes", icon: Database },
    { id: "storage", label: "S3 y limpieza", icon: HardDrive },
  ];

  return (
    <div className="min-h-screen bg-[#05070d] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto w-full max-w-[1780px] space-y-4">
        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.14em] text-white/55 uppercase">Admin Console</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Gestor avanzado conectado</h1>
              <p className="mt-2 text-sm text-white/68">
                Usuarios, proyectos, nodos, APIs y archivos S3 en una navegación única y simple.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={devPasscode}
                onChange={(e) => setDevPasscode(e.target.value)}
                placeholder="Dev code"
                className="w-28 rounded-lg border border-white/20 bg-white/[0.04] px-2 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              >
                <RefreshCcw size={14} />
                Recargar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-[#8f66ff]/45 bg-[#8f66ff]/14 text-white"
                      : "border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        {data && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            {[
              ["Usuarios", data.summary.users, Users],
              ["Online ahora", data.summary.usersOnlineNow, UserRound],
              ["Proyectos", data.summary.projects, FolderKanban],
              ["Nodos", data.summary.nodeInstances, Waypoints],
              ["Archivos", data.summary.files, HardDrive],
              ["S3 total", formatBytes(data.summary.totalBytes), HardDrive],
              ["Llamadas API", data.summary.apiCalls, Database],
              ["Coste API", formatMoney(data.summary.apiCostUsd), Clock3],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-white/55">{label}</p>
                <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
                  <Icon size={15} className="text-[#8f66ff]" />
                  {String(value)}
                </p>
              </div>
            ))}
          </section>
        )}

        {activeTab === "overview" && data && (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Usuarios conectados ahora</p>
                <div className="space-y-2">
                  {data.onlineUsers.slice(0, 10).map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => setSelectedUser(u.email)}
                      className="w-full rounded-lg border border-emerald-300/30 bg-emerald-300/[0.06] p-2 text-left text-sm"
                    >
                      <p className="truncate font-medium">{u.name || u.email}</p>
                      <p className="truncate text-xs text-emerald-100/65">{u.email}</p>
                    </button>
                  ))}
                  {data.onlineUsers.length === 0 && (
                    <p className="text-xs text-white/45">Sin usuarios online en este momento.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Usuarios</p>
                <div className="max-h-[330px] space-y-2 overflow-auto pr-1">
                  {data.users.map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u.email);
                        setSelectedProject(null);
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left text-sm transition ${
                        selectedUser === u.email
                          ? "border-[#8f66ff]/45 bg-[#8f66ff]/14"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="truncate font-medium">{u.name || u.email}</p>
                      <p className="truncate text-xs text-white/55">{u.email}</p>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs tracking-[0.1em] text-white/48 uppercase">Usuario seleccionado</p>
                  {selectedUserInfo ? (
                    <div className="mt-2 text-sm">
                      <p className="font-semibold">{selectedUserInfo.name || selectedUserInfo.email}</p>
                      <p className="text-white/55">{selectedUserInfo.email}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <p>Proyectos: {selectedUserInfo.projectCount}</p>
                        <p>Archivos: {selectedUserInfo.fileCount}</p>
                        <p>Nodos: {selectedUserInfo.nodeCount}</p>
                        <p>Sesiones: {selectedUserInfo.sessionCount}</p>
                        <p>Tiempo: {selectedUserInfo.estimatedMinutes} min</p>
                        <p>Ult. act.: {formatDate(selectedUserInfo.lastActiveAt)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">Sin usuario seleccionado.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs tracking-[0.1em] text-white/48 uppercase">Proyecto seleccionado</p>
                  {selectedProjectInfo ? (
                    <div className="mt-2 text-sm">
                      <p className="font-semibold">{selectedProjectInfo.name}</p>
                      <p className="text-white/55">{selectedProjectInfo.ownerEmail}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <p>Nodos: {selectedProjectInfo.nodeCount}</p>
                        <p>Conexiones: {selectedProjectInfo.edgeCount}</p>
                        <p>Archivos: {selectedProjectInfo.fileCount}</p>
                        <p>Peso: {formatBytes(selectedProjectInfo.totalBytes)}</p>
                        <p>Spaces: {selectedProjectInfo.spacesCount}</p>
                        <p>Actualizado: {formatDate(selectedProjectInfo.updatedAt)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">Sin proyecto seleccionado.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs tracking-[0.1em] text-white/48 uppercase">
                    Calendario de conexiones ({data.calendar.length} dias)
                  </p>
                  <p className="text-xs text-white/55">
                    Activos hoy: <span className="font-semibold text-white">{data.calendar[data.calendar.length - 1]?.activeUsers ?? 0}</span>
                  </p>
                </div>
                <CalendarHeatmap days={data.calendar} />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs tracking-[0.1em] text-white/48 uppercase">Proyectos ({userFilteredProjects.length})</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setSelectedProject(null);
                    }}
                    className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
                  >
                    Limpiar filtros
                  </button>
                </div>
                <div className="max-h-[280px] overflow-auto rounded-lg border border-white/8">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] tracking-[0.08em] text-white/55 uppercase">
                      <tr>
                        <th className="px-2 py-2">Proyecto</th>
                        <th className="px-2 py-2">Owner</th>
                        <th className="px-2 py-2">Nodos</th>
                        <th className="px-2 py-2">Archivos</th>
                        <th className="px-2 py-2">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userFilteredProjects.map((p) => (
                        <tr key={p.id} className="border-t border-white/6">
                          <td className="px-2 py-2">{p.name}</td>
                          <td className="px-2 py-2 text-xs text-white/65">{p.ownerEmail}</td>
                          <td className="px-2 py-2 text-xs">{p.nodeCount}</td>
                          <td className="px-2 py-2 text-xs">{p.fileCount}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedProject(p.id)}
                              className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/[0.06]"
                            >
                              Foco
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          </section>
        )}

        {activeTab === "usage" && data && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs tracking-[0.1em] text-white/48 uppercase">Estudio API (desde {formatDate(data.apiUsage.since)})</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs text-white/55">Llamadas</p>
                    <p className="mt-1 text-xl font-semibold">{data.apiUsage.totals.calls}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs text-white/55">Coste total</p>
                    <p className="mt-1 text-xl font-semibold">{formatMoney(data.apiUsage.totals.costUsd)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs text-white/55">Tokens</p>
                    <p className="mt-1 text-xl font-semibold">{data.apiUsage.totals.totalTokens.toLocaleString("es-ES")}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Coste por usuario</p>
                <div className="max-h-[280px] overflow-auto rounded-lg border border-white/8">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#11141d] text-[10px] tracking-[0.08em] text-white/60 uppercase">
                      <tr>
                        <th className="px-2 py-2">Usuario</th>
                        <th className="px-2 py-2">Llamadas</th>
                        <th className="px-2 py-2">Coste</th>
                        <th className="px-2 py-2">Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.apiUsage.byUser.map((row) => (
                        <tr key={row.userEmail} className="border-t border-white/6">
                          <td className="px-2 py-2">{row.userEmail}</td>
                          <td className="px-2 py-2">{row.calls}</td>
                          <td className="px-2 py-2">{formatMoney(row.costUsd)}</td>
                          <td className="px-2 py-2">{row.totalTokens.toLocaleString("es-ES")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Coste por servicio</p>
                <div className="max-h-[300px] overflow-auto rounded-lg border border-white/8">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#11141d] text-[10px] tracking-[0.08em] text-white/60 uppercase">
                      <tr>
                        <th className="px-2 py-2">Servicio</th>
                        <th className="px-2 py-2">Llamadas</th>
                        <th className="px-2 py-2">Coste</th>
                        <th className="px-2 py-2">Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.apiUsage.byService.map((row) => (
                        <tr key={row.serviceId} className="border-t border-white/6">
                          <td className="px-2 py-2">{row.label}</td>
                          <td className="px-2 py-2">{row.calls}</td>
                          <td className="px-2 py-2">{formatMoney(row.costUsd)}</td>
                          <td className="px-2 py-2">{row.totalTokens.toLocaleString("es-ES")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Bloqueo de APIs (activar / desactivar)</p>
                <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
                  {data.apiControls.map((control) => (
                    <div
                      key={control.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{control.label}</p>
                        <p className="truncate text-[11px] text-white/45">
                          {control.id} · {control.updatedBy} · {formatDate(control.updatedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={togglingId === control.id}
                        onClick={() => void toggleApi(control.id, !control.enabled)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                          control.enabled
                            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                            : "border-red-400/35 bg-red-400/12 text-red-200"
                        } ${togglingId === control.id ? "opacity-60" : "hover:brightness-110"}`}
                      >
                        <Power size={11} />
                        {control.enabled ? "Activo" : "Bloqueado"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Proveedor / modelo</p>
                <div className="max-h-[250px] overflow-auto rounded-lg border border-white/8">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#11141d] text-[10px] tracking-[0.08em] text-white/60 uppercase">
                      <tr>
                        <th className="px-2 py-2">Proveedor</th>
                        <th className="px-2 py-2">Modelo</th>
                        <th className="px-2 py-2">Coste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.apiUsage.byProviderModel.map((row) => (
                        <tr key={`${row.provider}-${row.model}`} className="border-t border-white/6">
                          <td className="px-2 py-2">{row.provider}</td>
                          <td className="px-2 py-2">{row.model}</td>
                          <td className="px-2 py-2">{formatMoney(row.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs tracking-[0.1em] text-white/48 uppercase">Tendencia diaria (llamadas)</p>
                <div className="space-y-2">
                  {data.apiUsage.byDay.slice(-14).map((d) => {
                    const max = Math.max(1, ...data.apiUsage.byDay.map((x) => x.calls));
                    const w = Math.max(4, Math.round((d.calls / max) * 100));
                    return (
                      <div key={d.day} className="text-xs">
                        <div className="mb-1 flex items-center justify-between text-white/70">
                          <span>{d.day}</span>
                          <span>{d.calls} llamadas · {formatMoney(d.costUsd)}</span>
                        </div>
                        <div className="h-2 rounded bg-white/8">
                          <div className="h-full rounded bg-[#8f66ff]" style={{ width: `${w}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "storage" && data && (
          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs tracking-[0.1em] text-white/48 uppercase">Gestor S3 por proyecto y huerfanos</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                  placeholder="Buscar archivo, carpeta o email"
                  className="w-60 rounded-lg border border-white/20 bg-white/[0.04] px-2.5 py-2 text-xs"
                />
                <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={showOrphansOnly}
                    onChange={(e) => setShowOrphansOnly(e.target.checked)}
                  />
                  Solo huerfanos
                </label>
                <button
                  type="button"
                  onClick={openDeleteSelected}
                  disabled={selectedFiles.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-400/35 bg-red-400/10 px-3 py-2 text-xs text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 size={12} />
                  Eliminar ({selectedFiles.length})
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
                <p className="text-white/55">Archivos visibles</p>
                <p className="mt-1 text-xl font-semibold">{filteredFiles.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
                <p className="text-white/55">Seleccionados</p>
                <p className="mt-1 text-xl font-semibold">{selectedFiles.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
                <p className="text-white/55">Peso seleccionado</p>
                <p className="mt-1 text-xl font-semibold">{formatBytes(selectedBytes)}</p>
              </div>
              <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs">
                <p className="text-amber-100/80">Huerfanos globales</p>
                <p className="mt-1 text-xl font-semibold text-amber-100">{data.summary.orphanFiles}</p>
              </div>
            </div>

            <div className="max-h-[760px] overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#11141d] text-[10px] tracking-[0.08em] text-white/60 uppercase">
                  <tr>
                    <th className="w-8 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={
                          filteredFiles.length > 0 &&
                          filteredFiles.every((f) => selectedKeys.has(f.key))
                        }
                        onChange={() => {
                          const next = new Set(selectedKeys);
                          const all = filteredFiles.every((f) => selectedKeys.has(f.key));
                          if (all) filteredFiles.forEach((f) => next.delete(f.key));
                          else filteredFiles.forEach((f) => next.add(f.key));
                          setSelectedKeys(next);
                        }}
                      />
                    </th>
                    <th className="px-2 py-2">Nombre</th>
                    <th className="px-2 py-2">Carpeta</th>
                    <th className="px-2 py-2">Relacion</th>
                    <th className="px-2 py-2">Tamaño</th>
                    <th className="px-2 py-2">Fecha</th>
                    <th className="w-16 px-2 py-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((f) => (
                    <tr key={f.key} className="border-t border-white/6">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(f.key)}
                          onChange={() => {
                            const next = new Set(selectedKeys);
                            if (next.has(f.key)) next.delete(f.key);
                            else next.add(f.key);
                            setSelectedKeys(next);
                          }}
                        />
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        <p className="truncate font-medium text-white">{f.name}</p>
                        <p className="truncate text-[10px] text-white/45">{f.key}</p>
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-2 text-white/65">{f.folder}</td>
                      <td className="max-w-[220px] px-2 py-2">
                        {f.orphan ? (
                          <span className="rounded border border-amber-300/35 bg-amber-300/10 px-1.5 py-0.5 text-amber-100">Orphan</span>
                        ) : (
                          <p className="truncate text-white/75">{f.projectNames.join(", ")}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">{formatBytes(f.size)}</td>
                      <td className="px-2 py-2">{formatDate(f.lastModified)}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => openDeleteOne(f)}
                          className="rounded border border-red-400/30 bg-red-400/10 px-2 py-1 text-red-200 hover:bg-red-400/18"
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredFiles.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-white/45">
                        Sin archivos para los filtros actuales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {loading && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/65">
            Cargando panel...
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            {notice}
          </div>
        )}
      </div>

      {deletePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c1018] p-5">
            <div className="flex items-center gap-2 text-red-200">
              <AlertTriangle size={16} />
              <p className="text-sm font-semibold">Confirmar eliminación</p>
            </div>
            <p className="mt-3 text-sm text-white/80">
              Vas a eliminar <strong>{deletePlan.keys.length}</strong> archivo(s). Espacio estimado: <strong>{formatBytes(deletePlan.totalBytes)}</strong>.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletePlan(null)}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/75 transition hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-red-400/35 bg-red-400/14 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/22 disabled:opacity-50"
              >
                <HardDrive size={14} />
                {deleting ? "Eliminando..." : "Eliminar ahora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
