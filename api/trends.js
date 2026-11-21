export default async function handler(req, res) {
  const { subCategory = 'all' } = req.query;
  const geminiKey = process.env.GEMINI_API_KEY;

  const subMeta = {
    all: {
      label: '전체 인기 상품',
      seeds: ['겨울 가습기', '욕실 청소용품', '무선 청소기', '온열 찜질기', '생활 꿀템'],
      prompt: '현재 한국 네이버 쇼핑에서 검색량이 급증하는 인기 생활·가전·식품 상품명 키워드(2~10자) 10개'
    },
    living: {
      label: '생활 · 건강',
      seeds: ['초음파 가습기', '욕실 청소솔', '미니 온풍기', '주방 정리템', '극세사 이불'],
      prompt: '현재 한국 네이버 쇼핑 생활·건강·청소 카테고리 인기 급상승 상품명 키워드(2~10자) 10개'
    },
    food: {
      label: '식품 · 건강식',
      seeds: ['배도라지즙', '쌍화차 진액', '저당 단백질', '꿀유자차', '유기농 올리브오일'],
      prompt: '현재 한국 네이버 쇼핑 식품·건강식품·제철먹거리 인기 급상승 상품명 키워드(2~10자) 10개'
    },
    digital: {
      label: '디지털 · 가전',
      seeds: ['맥세이프 보조배터리', '핸디 청소기', '고속충전기', '노트북 거치대', '충전식 손난로'],
      prompt: '현재 한국 네이버 쇼핑 디지털·소형가전 인기 급상승 상품명 키워드(2~10자) 10개'
    },
    kids: {
      label: '출산 · 육아',
      seeds: ['어린이 유산균', '초등 오답노트', '키즈 경량패딩', '각도조절 독서대', '학습 타이머'],
      prompt: '현재 한국 네이버 쇼핑 출산·육아·초등준비물 인기 급상승 상품명 키워드(2~10자) 10개'
    }
  };

  const current = subMeta[subCategory] || subMeta.all;
  let keywords = [];

  if (geminiKey) {
    try {
      const prompt = `2026년 11월 오늘 기준 "${current.prompt}"을 조사해 순수 JSON만 출력하세요.
{"keywords":[{"keyword":"상품명1","badge":"급상승"},{"keyword":"상품명2","badge":"급상승"},{"keyword":"상품명3","badge":"인기"},{"keyword":"상품명4","badge":"인기"},{"keyword":"상품명5","badge":"인기"},{"keyword":"상품명6","badge":"추천"},{"keyword":"상품명7","badge":"추천"},{"keyword":"상품명8","badge":"상승"},{"keyword":"상품명9","badge":"상승"},{"keyword":"상품명10","badge":"스테디"}]}`;

      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.7 }
          })
        }
      );
      const gData = await gRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
          keywords = parsed.keywords.slice(0, 10);
        }
      }
    } catch (e) {}
  }

  // 안전망: 실시간 자동완성 API
  if (keywords.length === 0) {
    try {
      const collected = new Set();
      for (const seed of current.seeds) {
        if (collected.size >= 10) break;
        const acRes = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(seed)}`
        );
        const acData = await acRes.json();
        for (const item of (acData[1] || [])) {
          if (item && item.length <= 16 && collected.size < 10) collected.add(item.trim());
        }
      }
      keywords = [...collected].map((kw, i) => ({
        keyword: kw,
        badge: i < 2 ? '급상승' : i < 5 ? '인기' : '추천'
      }));
    } catch (e) {}
  }

  return res.status(200).json({ label: current.label, items: keywords });
}
