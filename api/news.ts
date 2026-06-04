import type { VercelRequest, VercelResponse, } from '@vercel/node';

const FEED_URL = 'https://www.rockpapershotgun.com/feed';
const MAX_ITEMS = 8;

function extract(xml: string, tag: string): string {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),);
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),);
  return plain ? plain[1].trim() : '';
}

function extractLink(block: string): string {
  const rss = block.match(/<link>([^<]+)<\/link>/i,);
  if (rss) return rss[1].trim();
  const atom = block.match(/<link[^>]+href="([^"]+)"/i,);
  return atom ? atom[1] : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8230;|&hellip;/g, '…')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function handler(_req: VercelRequest, res: VercelResponse,): Promise<void> {
  try {
    const feedRes = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'VibeCoded/1.0 RSS Reader', },
    },);
    if (!feedRes.ok) throw new Error(`Feed returned ${feedRes.status}`,);

    const xml = await feedRes.text();
    const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi,)]
      .slice(0, MAX_ITEMS)
      .map(m => m[1]);

    const items = itemBlocks.map(block => {
      const title = stripHtml(extract(block, 'title'),);
      const url = extractLink(block,);
      const summary = stripHtml(extract(block, 'description'),).slice(0, 200,);
      const publishedAt = extract(block, 'pubDate',);
      return { id: url, title, url, summary, publishedAt, source: 'Rock Paper Shotgun', };
    },);

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800',);
    res.json({ items, },);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502,).json({ error: `Failed to fetch news: ${message}`, },);
  }
}
