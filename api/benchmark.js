export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, manualText, imageBase64, imageMimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  let extractedText = manualText || '';

  if (!extractedText && !imageBase64 && url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      let targetUrl = url.trim();
      const headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      };

      const blogHomeMatch = targetUrl.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/?$/);
      if (blogHomeMatch) {
        const blogId = blogHomeMatch[1];
        const listRes = await fetch(`https://m.blog.naver.com/PostList.naver?blogId=${blogId}`, {
          headers,
          signal: controller.signal
        });
        const listHtml = await listRes.text();
        const logNoMatch = listHtml.match(/logNo=(\d{10,})/) || listHtml.match(/"logNo"\s*:\s*"?(\d{10,})"?/);
        targetUrl = logNoMatch
          ? `https://m.blog.naver.com/${blogId}/${logNoMatch[1]}`
          : `https://m.blog.naver.com/${blogId}`;
      } else if (targetUrl.includes('blog.naver.com') && !targetUrl.includes('m.blog.naver.com')) {
        targetUrl = targetUrl.replace('blog.naver.com', 'm.blog.naver.com');
      }

      const pageRes = await fetch(targetUrl, { headers, signal: controller.signal });
      const html = await pageRes.text();
      clearTimeout(timeoutId);

      const mainContainerMatch = html.match(/<div class="se-main-container">([\s\S]*?)<\/div>\s*<\/div>/);
      const targetHtml = mainContainerMatch ? mainContainerMatch[1] : html;
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      const postTitle = titleMatch ? `제목: ${titleMatch[1]}\n` : '';

      const cleanText = targetHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&quot;|&amp;|&#39;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      extractedText = (postTitle + cleanText).slice(0, 1800);
    } catch (e) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        error: '네이버 블로그 응답이 지연되어 불러오지 못했습니다. 아래 칸에 본문 텍스트나 캡처 이미지를 붙여넣어 주세요!'
      });
    }
  }

  if ((!extractedText || extractedText.length < 25) && !imageBase64) {
    return res.status(400).json({
      error: '블로그 본문을 읽어오지 못했습니다. 아래 칸에 본문이나 캡처 이미지를 붙여넣어 주세요!'
    });
  }

  const analyzePrompt = `제공된 블로그 글의 스타일 DNA를 짧고 핵심만 분석해 순수 JSON만 출력하세요.
${extractedText ? `[대상]\n${extractedText}` : '[대상: 첨부 이미지]'}
{"blogName":"블로그 분위기 요약","titlePattern":"제목 공식","tone":"문체/말투 습관","structure":"본문 전개 구조"}`;

  const parts = [{ text: analyzePrompt }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType || 'image/png',
        data: imageBase64
      }
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 450
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok || data.error) {
      const msg = data.error?.message || `HTTP ${response.status}`;
      return res.status(500).json({ error: `Gemini 오류: ${msg}` });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: '분석 결과를 해석하지 못했습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: `AI 분석 실패: ${err.message}` });
  }
}
