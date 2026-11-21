export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, manualText, imageBase64, imageMimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  let extractedText = manualText || '';

  // URL이 입력된 경우 네이버 블로그 홈 주소 및 개별 포스팅 URL 모두 처리
  if (!extractedText && !imageBase64 && url) {
    try {
      let targetUrl = url.trim();
      const headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      };

      // 네이버 블로그 메인 홈 주소(예: https://blog.naver.com/mini1319)인 경우 최신 글 주소를 자동 탐색
      const blogHomeMatch = targetUrl.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/?$/);
      if (blogHomeMatch) {
        const blogId = blogHomeMatch[1];
        const listRes = await fetch(`https://m.blog.naver.com/PostList.naver?blogId=${blogId}`, { headers });
        const listHtml = await listRes.text();

        // 최신 게시글 번호(logNo) 추출
        const logNoMatch = listHtml.match(/logNo=(\d{10,})/) || listHtml.match(/"logNo"\s*:\s*"?(\d{10,})"?/);
        if (logNoMatch) {
          targetUrl = `https://m.blog.naver.com/${blogId}/${logNoMatch[1]}`;
        } else {
          targetUrl = `https://m.blog.naver.com/${blogId}`;
        }
      } else if (targetUrl.includes('blog.naver.com') && !targetUrl.includes('m.blog.naver.com')) {
        targetUrl = targetUrl.replace('blog.naver.com', 'm.blog.naver.com');
      }

      const pageRes = await fetch(targetUrl, { headers });
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

  if ((!extractedText || extractedText.length < 30) && !imageBase64) {
    return res.status(400).json({
      error: '블로그 본문을 읽어오지 못했습니다. 특정 게시글 URL을 넣거나 아래 칸에 본문·캡처 이미지를 붙여넣어 주세요!'
    });
  }

  const analyzePrompt = `
제공된 블로그 게시글(텍스트 또는 캡처 이미지)을 정밀 분석하여, 이 작성자만의 글쓰기 스타일 DNA를 추출하세요.
반드시 다른 설명 없이 순수 JSON 형식으로만 반환하세요.

${extractedText ? `[분석 대상 텍스트]\n${extractedText}` : '[분석 대상: 첨부된 블로그 캡처 이미지의 텍스트, 문단 호흡, 소제목 배치, 말투를 읽어 분석할 것]'}

[반환 JSON 형식]
{
  "blogName": "블로그명 또는 글의 핵심 분위기 한줄 요약",
  "titlePattern": "제목 작성 공식 (어미, 쉼표/물음표 활용, 호기심 유발 포인트 등)",
  "tone": "문체 및 말투 습관 (예: 다정한 해요체, 짧은 2줄 호흡, 공감 유도형 추임새 등)",
  "structure": "본문 전개 뼈대 (도입부 → 문제제기 → 해결/정보 → 마무리 순서와 소제목 스타일)"
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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.4 }
        })
      }
    );

    const data = await response.json();

    // Gemini API 자체 에러 메시지 안전 처리
    if (!response.ok || data.error) {
      const apiErrMsg = data.error?.message || `HTTP ${response.status} 오류`;
      return res.status(500).json({ error: `Gemini API 오류: ${apiErrMsg}` });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI 분석 결과를 해석하지 못했습니다. 다시 시도해 주세요.' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: '스타일 분석 중 오류가 발생했습니다: ' + err.message });
  }
}
