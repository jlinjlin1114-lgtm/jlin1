export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { topic, topicName, keyword, memo, rule, benchmarkStyle } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  const styleModeInstruction = benchmarkStyle
    ? `[벤치마킹 구조·말투 복제 + 100% 신규 창작] 참고 테마(${benchmarkStyle.blogName})의 제목 공식(${benchmarkStyle.titlePattern}), 말투(${benchmarkStyle.tone}), 전개 구조(${benchmarkStyle.structure})만 모방하고 내용은 "${keyword}"에 맞춰 100% 새롭게 창작하세요. 기본 규칙: ${rule}`
    : `[주제 전용 기본 규칙] ${rule}`;

  const prompt = `네이버 블로그 홈판 상위노출 에디터로서 아래 조건에 맞춰 순수 JSON만 빠르게 출력하세요.
- 주제: ${topicName} (${topic})
- 키워드/상품: ${keyword}
- 추가 메모: ${memo || '없음'}
- 지침: ${styleModeInstruction}

{
  "appliedMode": "${benchmarkStyle ? '벤치마킹 구조·말투 복제 창작 모드' : '주제 전용 기본 규칙 모드'}",
  "titles": ["제목1", "제목2", "제목3", "제목4", "제목5"],
  "body": "줄바꿈(\\n\\n) 적용된 본문 전체 (건강은 공백 제외 1,200자 내외, 쇼핑커넥트는 제휴 고지 포함)",
  "hashtags": "#태그1 #태그2 #태그3 #태그4 #태그5 #태그6 #태그7 #태그8 #태그9 #태그10",
  "imagePrompts": ["1컷 묘사(인물·텍스트 제외)", "2컷 묘사", "3컷 묘사", "4컷 묘사", "5컷 묘사", "6컷 묘사"]
}`;

  // 가장 빠른 초고속 모델 순서로 배치 + thinkingBudget: 0으로 대기시간 제거
  const candidateModels = ['gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
  let lastError = '';

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        }
      );

      clearTimeout(timer);
      const data = await response.json();

      if (!response.ok || data.error) {
        lastError = data.error?.message || `HTTP ${response.status}`;
        continue;
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return res.status(200).json(JSON.parse(jsonMatch[0]));
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err.name === 'AbortError' ? '응답 시간 초과' : err.message;
    }
  }

  return res.status(500).json({ error: `원고 생성 오류: ${lastError}` });
}
