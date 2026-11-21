export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const {
    topic,
    topicName,
    keyword,
    memo,
    rule,
    benchmarkText,
    benchmarkImageBase64,
    benchmarkImageMime
  } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  const hasBenchmark = Boolean((benchmarkText && benchmarkText.trim().length > 10) || benchmarkImageBase64);

  const benchmarkInstruction = hasBenchmark
    ? `
[필수 지침: 벤치마킹 글 구조·말투·형태 완벽 복제 + 100% 신규 창작]
제공된 벤치마킹 원문(또는 캡처 이미지)의 '문단 길이와 줄바꿈 호흡, 소제목/강조 형태, 어미와 다정한 말투 습관, 도입→전개→마무리 뼈대'를 정밀하게 분석해 똑같은 스타일과 형태로 작성하세요.
단, 벤치마킹 글의 실제 내용이나 문장은 절대 베끼지 말고, 새로운 주제 키워드("${keyword}")에 맞춰 100% 새로운 정보와 사례로 창작해야 합니다.
${benchmarkText ? `\n[벤치마킹 참고 텍스트]\n${benchmarkText.slice(0, 3000)}` : '\n[벤치마킹 참고 대상: 첨부된 캡처 이미지의 구조·문체·형태를 읽어서 적용할 것]'}
`
    : `[작성 지침] 아래 주제 전용 규칙을 충실히 따라 작성하세요.`;

  const prompt = `당신은 네이버 블로그 홈판(피드) 상위노출 및 전환율 전문 에디터입니다.
아래 조건에 맞춰 완벽한 블로그 원고 패키지를 순수 JSON 형식으로만 출력하세요.

- 카테고리: ${topicName} (${topic})
- 작성할 새 키워드/상품/이슈: ${keyword}
- 추가 메모/포인트: ${memo || '없음'}
- 카테고리 기본 규칙: ${rule}
${benchmarkInstruction}

[출력 JSON 형식 - 반드시 아래 키만 반환]
{
  "appliedMode": "${hasBenchmark ? '벤치마킹 구조·말투 복제 창작' : '카테고리 전용 기본 규칙'}",
  "titles": ["홈판 클릭 유도 제목 1", "제목 2", "제목 3", "제목 4", "제목 5"],
  "body": "가독성 좋게 빈 줄(\\n\\n)로 문단이 나뉜 본문 전체 (건강 카테고리는 공백 제외 1,200자 내외 준수, 쇼핑 커넥트는 하단에 제휴 수수료 고지 문구 포함)",
  "hashtags": "#태그1 #태그2 #태그3 #태그4 #태그5 #태그6 #태그7 #태그8 #태그9 #태그10",
  "imagePrompts": [
    "1컷 실사 이미지 묘사 (인물·글씨·워터마크 절대 제외)",
    "2컷 실사 이미지 묘사",
    "3컷 실사 이미지 묘사",
    "4컷 실사 이미지 묘사",
    "5컷 실사 이미지 묘사",
    "6컷 실사 이미지 묘사"
  ]
}`;

  const parts = [{ text: prompt }];
  if (benchmarkImageBase64) {
    parts.push({
      inlineData: {
        mimeType: benchmarkImageMime || 'image/png',
        data: benchmarkImageBase64
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
          generationConfig: { temperature: 0.78 }
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
      return res.status(500).json({ error: '원고 결과를 해석하지 못했습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: `원고 생성 오류: ${err.message}` });
  }
}
