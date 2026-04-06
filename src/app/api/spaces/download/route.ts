import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Handle both JSON and Form Data (forms send URL-encoded/form-data)
    let base64, filename, format;
    
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      base64 = body.base64;
      filename = body.filename;
      format = body.format;
    } else {
      const formData = await req.formData();
      base64 = formData.get('base64') as string;
      filename = formData.get('filename') as string;
      format = formData.get('format') as string;
    }

    if (!base64) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    // Extract the actual base64 data (strip the prefix if exists)
    const base64Parts = base64.split(',');
    const base64Content = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const buffer = Buffer.from(base64Content, 'base64');
    
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    
    // Sanitize filename to be ultra-safe
    const safeFilename = (filename || `AI_Download_${Date.now()}.${extension}`)
      .replace(/[^a-z0-9.]/gi, '_');

    console.log(`[Download API] Serving file: ${safeFilename} (${Math.round(buffer.length / 1024)} KB)`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Download API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
