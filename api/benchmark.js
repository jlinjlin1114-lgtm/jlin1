
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, manualText } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  let extractedText = manualText || '';

  // URL이 입력된 경우 모바일 네이버 블로그 페이지 HTML 추출
  if (!extractedText && url) {
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
      // HTML 태그 제거 후 핵심 텍스트만 추출
      const cleanText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      extractedText = cleanText.slice(0, 4500);
    } catch (e) {
      return res.status(400).json({ error: '블로그 페이지를 불러오지 못했습니다. 본문 직접 붙여넣기를 이용해 주세요.' });
    }
  }

  if (!extractedText || extractedText.length < 30) {
    return res.status(400).json({ error: '분석할 블로그 텍스트가 부족합니다.' });
  }

  const analyzePrompt = `
다음은 벤치마킹할 인기 네이버 블로그의 텍스트 데이터입니다.
이 블로거의 글쓰기 스타일 DNA를 분석하여 아래 JSON 형식으로만 반환하세요.

[분석 대상 텍스트]
${extractedText}

[반환 JSON 형식]
{
  "blogName": "블로그명 또는 핵심 테마 요약",
  "titlePattern": "제목 작성 공식 (어미, 쉼표/물음표 활용법, 숫자·반전 요소 등 구체적 분석)",
  "tone": "문체 및 어미 습관 (예: 다정한 해요체, 짧은 문장 호흡, 공감 유도형 등)",
  "structure": "본문 전개 공식 (도입부 → 문제제기 → 해결/정보 → 마무리 순서)"
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: analyzePrompt }] }],
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
