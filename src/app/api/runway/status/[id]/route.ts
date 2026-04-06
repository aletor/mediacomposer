import { NextResponse } from 'next/server';
import RunwayML from '@runwayml/sdk';

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const taskId = params.id;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const runway = getRunwayClient();
    const task = await runway.tasks.retrieve(taskId) as any;

    return NextResponse.json({
      status: task.status, // 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
      progress: task.progress,
      output: task.output, // Array of URLs if SUCCEEDED
      error: task.failureCode || task.failureReason
    });
  } catch (error: any) {
    console.error("[Runway Status API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
