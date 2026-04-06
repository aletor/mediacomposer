import { NextRequest, NextResponse } from "next/server";
import { uploadToS3, getPresignedUrl } from "@/lib/s3-utils";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  console.log("[Gemini Video] Request received");
  try {
    const { 
      prompt, 
      firstFrame, 
      lastFrame, 
      resolution, 
      durationSeconds, 
      audio,
      seed,
      negativePrompt,
      animationPrompt,
      cameraPreset
    } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const modelId = "veo-3.1-generate-preview";
    const endpoint = `${BASE_URL}/models/${modelId}:predictLongRunning?key=${apiKey}`;

    const referenceImages: any[] = [];

    const processImage = async (image: string, type: string) => {
      if (!image) return;
      let base64Data = "";
      let mimeType = "image/png";

      if (image.startsWith('data:')) {
        const splitParts = image.split(';base64,');
        mimeType = splitParts[0].split(':')[1];
        base64Data = splitParts[1];
      } else if (image.startsWith('http')) {
        const imgRes = await fetch(image, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!imgRes.ok) throw new Error(`Failed to fetch ${type}: ${imgRes.status}`);
        const buffer = await imgRes.arrayBuffer();
        base64Data = Buffer.from(buffer).toString('base64');
        mimeType = imgRes.headers.get('content-type') || 'image/png';
      }

      if (base64Data) {
        referenceImages.push({
          image: {
            bytesBase64Encoded: base64Data,
            mimeType: mimeType
          },
          referenceType: type
        });
      }
    };

    await processImage(firstFrame, "first_frame");
    await processImage(lastFrame, "last_frame");

    // Construct Enhanced Prompt
    let finalPrompt = prompt;
    if (animationPrompt) finalPrompt += `. Animation: ${animationPrompt}`;
    if (cameraPreset) finalPrompt += `. Camera motion: ${cameraPreset}`;
    if (negativePrompt) finalPrompt += `. Negative prompt: avoid ${negativePrompt}`;

    const payload = {
      instances: [{
        prompt: finalPrompt,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
        resolution: resolution || "1080p",
        seed: seed !== undefined ? Number(seed) : undefined
      }
    };

    console.log("[Gemini Video] Payload Structure Verified");
    console.log(`[Gemini Video] Calling ${modelId}...`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[Gemini Video] API ERROR:", JSON.stringify(data, null, 2));
      return NextResponse.json({ error: data.error?.message || "Gemini Video API Error" }, { status: response.status });
    }

    const operationName = data.name;
    console.log(`[Gemini Video] Operation started: ${operationName}`);

    // Polling Mechanism
    let isDone = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 10s = 300s (5 mins)
    let videoUri = "";

    while (!isDone && attempts < maxAttempts) {
      attempts++;
      console.log(`[Gemini Video] Polling attempt ${attempts}/${maxAttempts}...`);
      await new Promise(r => setTimeout(r, 10000)); // Wait 10s

      const pollRes = await fetch(`${BASE_URL}/${operationName}?key=${apiKey}`);
      const pollData = await pollRes.json();

      if (pollData.done) {
        isDone = true;
        videoUri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        console.log(`[Gemini Video] Operation complete. Video URI: ${videoUri}`);
      }
    }

    if (!videoUri) {
      throw new Error("Video generation timed out or failed to return URI");
    }

    // Download and upload to S3
    console.log("[Gemini Video] Downloading generated video...");
    const videoRes = await fetch(videoUri, {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (!videoRes.ok) throw new Error("Failed to download video from Google");
    
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `veo_${crypto.randomUUID()}.mp4`;
    const key = await uploadToS3(filename, videoBuffer, "video/mp4");
    const url = await getPresignedUrl(key);

    return NextResponse.json({ 
      output: url,
      key: key,
      status: "success"
    });

  } catch (error: any) {
    console.error("[Gemini Video] Global Exception:", error.message);
    return NextResponse.json({ error: `Server Exception: ${error.message}` }, { status: 500 });
  }
}
