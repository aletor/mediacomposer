import { NextResponse } from 'next/server';
const gis = require('g-i-s');

const searchGoogleImages = (query: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[Search API] Search timeout for: "${query}"`);
      resolve([]);
    }, 8000);

    gis(query, (error: any, results: any[]) => {
      clearTimeout(timer);
      if (error) {
        console.error(`[Search API] GIS Error for "${query}":`, error);
        resolve([]);
      } else {
        resolve(results || []);
      }
    });
  });
};

const searchWikipediaImage = async (query: string): Promise<string[]> => {
  try {
    const headers = { 'User-Agent': 'SpaceAI-ContentEngine/1.0 (contact: info@ai-spaces.studio)' };
    
    // 1. Search for the page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData: any = await searchRes.json();
    const title = searchData.query?.search?.[0]?.title;
    
    if (!title) return [];

    // 2. Get images from that page
    const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=images&format=json&origin=*`;
    const imagesRes = await fetch(imagesUrl, { headers });
    const imagesData: any = await imagesRes.json();
    const pages = imagesData.query.pages;
    const pageId = Object.keys(pages)[0];
    const images = pages[pageId].images;

    if (!images) return [];

    // 3. Filter for likely good images (JPG, PNG)
    const validImages = images.filter((img: any) => {
      const t = img.title.toLowerCase();
      return (t.endsWith('.jpg') || t.endsWith('.jpeg') || t.endsWith('.png')) && 
             !t.includes('increase') && !t.includes('decrease') && !t.includes('stub') && !t.includes('icon');
    }).slice(0, 5);

    // 4. Get the actual URLs
    const urls: string[] = [];
    for (const img of validImages) {
      const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const infoRes = await fetch(infoUrl, { headers });
      const infoData: any = await infoRes.json();
      const infoPages = infoData.query.pages;
      const infoPageId = Object.keys(infoPages)[0];
      const url = infoPages[infoPageId].imageinfo?.[0]?.url;
      if (url) urls.push(url);
    }

    return urls;
  } catch (err) {
    console.error('[Search API] Wikipedia Error:', err);
    return [];
  }
};

export async function POST(req: Request) {
  try {
    const { query, limit = 5 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`[Search API] Searching for: "${query}" (limit: ${limit})`);
    
    // Try GIS first
    let urls = [];
    try {
      const searchResults = await searchGoogleImages(query);
      urls = searchResults
        .map((r: any) => r.url)
        .filter((u: any) => {
          if (!u || typeof u !== 'string') return false;
          return u.startsWith('http') && !u.includes('lookaside.fbsbx.com');
        })
        .slice(0, limit);
    } catch (e) {
      console.warn('[Search API] GIS failed, falling back to Wikipedia');
    }

    // Fallback if no URLs found
    if (urls.length === 0) {
      console.log(`[Search API] GIS returned nothing. Trying Wikipedia for: "${query}"`);
      const wikiUrls = await searchWikipediaImage(query);
      urls = wikiUrls.slice(0, limit);
    }

    return NextResponse.json({ urls });
  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
