export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ items: [] });

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const xml = await response.text();

    const items = [];
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const block of itemMatches) {
      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      if (titleMatch) {
        const rawTitle = titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const parts = rawTitle.split(' - ');
        const cleanTitle = parts.length > 1 ? parts.slice(0, -1).join(' - ') : rawTitle;
        const pubDateStr = dateMatch ? dateMatch[1].trim() : '';
        const timestamp = pubDateStr ? new Date(pubDateStr).getTime() : 0;

        items.push({
          title: cleanTitle,
          link: linkMatch ? linkMatch[1].trim() : '#',
          pubDate: pubDateStr,
          timestamp: isNaN(timestamp) ? 0 : timestamp,
          source: sourceMatch ? sourceMatch[1].trim() : (parts.length > 1 ? parts[parts.length - 1] : 'NEWS')
        });
      }
    }

    // 최신순(timestamp 내림차순) 정렬 후 상위 8개 반환
    items.sort((a, b) => b.timestamp - a.timestamp);

    res.status(200).json({ items: items.slice(0, 8) });
  } catch (e) {
    res.status(500).json({ items: [], error: e.message });
  }
}
