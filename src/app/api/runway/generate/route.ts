import { NextResponse } from 'next/server';
import RunwayML from '@runwayml/sdk';

function getRunwayClient() {
  const apiKey =
    process.env.RUNWAYML_API_KEY || process.env.RUNWAYML_API_SECRET || "";
  return new RunwayML({ apiKey });
}

export async function POST(req: Request) {
  try {
    const { promptText, videoUrl, imageUrl, duration = 5 } = await req.json();

    if (!promptText) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
    }

    const runway = getRunwayClient();

    console.log(`[Runway API] Starting ${duration}s generation task...`);

    // Using Gen-3 Alpha Turbo for fast results
    const task = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage: videoUrl || imageUrl, 
      promptText: promptText,
      duration: duration as 5 | 10
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error: any) {
    console.error("[Runway API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
