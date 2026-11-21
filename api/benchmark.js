export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, manualText, imageBase64, imageMimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  let extractedText = manualText || '';

  // 1단계: 네이버 블로그 본문 초고속 추출 (4초 타임아웃 제한)
  if (!extractedText && !imageBase64 && url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

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

      // 스마트에디터 본문 영역(se-main-container) 우선 추출하여 속도와 정확도 극대화
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

      extractedText = (postTitle + cleanText).slice(0, 2800);
    } catch (e) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        error: '네이버 블로그 응답이 지연되어 불러오지 못했습니다. 아래 칸에 본문 텍스트나 캡처 이미지를 붙여넣어 주세요!'
      });
    }
  }

  if ((!extractedText || extractedText.length < 30) && !imageBase64) {
    return res.status(400).json({
      error: '블로그 본문을 읽어오지 못했습니다. 아래 칸에 본문이나 캡처 이미지를 붙여넣어 주세요!'
    });
  }

  const analyzePrompt = `
제공된 블로그 게시글의 글쓰기 스타일 DNA를 분석하여 순수 JSON 형식으로만 반환하세요.
${extractedText ? `[분석 대상]\n${extractedText}` : '[분석 대상: 첨부된 블로그 캡처 이미지]'}

{
  "blogName": "블로그 핵심 분위기 한줄 요약",
  "titlePattern": "제목 작성 공식 (어미, 쉼표/물음표, 후킹 요소)",
  "tone": "문체 및 말투 습관 (어미, 문장 호흡)",
  "structure": "본문 전개 뼈대 (도입 → 전개 → 마무리 순서)"
}
`;

  const parts = [{ text: analyzePrompt }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType || 'image/png',
        data: imageBase64
      }
    });
  }

  // 사용 가능한 최신 모델 순차 자동 호출
  const candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = '';

  for (const modelName of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
          })
        }
      );

      const data = await response.json();
      if (!response.ok || data.error) {
        lastError = data.error?.message || `HTTP ${response.status}`;
        continue; // 다음 모델로 즉시 전환
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return res.status(200).json(JSON.parse(jsonMatch[0]));
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(500).json({ error: `AI 분석 실패: ${lastError}` });
}
