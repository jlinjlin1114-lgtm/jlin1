export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, manualText, imageBase64, imageMimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  let extractedText = manualText || '';

  // URL이 입력된 경우 모바일 네이버 블로그 페이지 HTML 추출
  if (!extractedText && !imageBase64 && url) {
    try {
      let targetUrl = url.trim();
      if (targetUrl.includes('blog.naver.com') && !targetUrl.includes('m.blog.naver.com')) {
        targetUrl = targetUrl.replace('blog.naver.com', 'm.blog.naver.com');
      }
      const pageRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        }
      });
      const html = await pageRes.text();
      const cleanText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      extractedText = cleanText.slice(0, 4500);
    } catch (e) {
      return res.status(400).json({ error: '블로그 페이지를 불러오지 못했습니다. 본문 붙여넣기나 캡처 이미지를 이용해 주세요.' });
    }
  }

  if ((!extractedText || extractedText.length < 20) && !imageBase64) {
    return res.status(400).json({ error: '분석할 블로그 URL, 본문 텍스트, 또는 캡처 이미지를 입력해 주세요.' });
  }

  const analyzePrompt = `
제공된 블로그 게시글(텍스트 또는 캡처 이미지)을 정밀 분석하여, 이 작성자만의 글쓰기 스타일 DNA를 추출하세요.
반드시 아래 JSON 형식으로만 반환하세요.

${extractedText ? `[분석 대상 텍스트]\n${extractedText}` : '[분석 대상: 첨부된 블로그 캡처 이미지의 텍스트, 문단 호흡, 소제목 배치, 말투를 읽어 분석할 것]'}

[반환 JSON 형식]
{
  "blogName": "블로그명 또는 글의 핵심 분위기 한줄 요약",
  "titlePattern": "제목 작성 공식 (어미, 쉼표/물음표 활용, 호기심 유발 포인트 등)",
  "tone": "문체 및 말투 습관 (예: 다정한 해요체, 짧은 2줄 호흡, 공감 유도형 추임새 등)",
  "structure": "본문 전개 뼈대 (도입부 → 문제제기 → 해결/정보 → 마무리 순서와 소제목 스타일)"
}
`;

  // 텍스트와 이미지(있을 경우)를 함께 Gemini 2.5 Flash에 전달
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    const data = await response.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: '스타일 분석 중 오류가 발생했습니다: ' + err.message });
  }
}
