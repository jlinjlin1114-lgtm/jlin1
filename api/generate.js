export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { topic, topicName, keyword, memo, rule, benchmarkStyle } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  const styleModeInstruction = benchmarkStyle
    ? `
[작성 모드: 벤치마킹 블로그 구조·말투 복제 + 100% 신규 창작]
아래 벤치마킹 블로그의 '문단 호흡, 전개 순서(뼈대), 어미와 말투, 제목 후킹 공식'만 똑같이 모방하세요.
단, 벤치마킹 글의 실제 내용이나 문장을 절대 베끼지 말고, 입력된 새로운 키워드("${keyword}")에 맞춰 완전히 새로운 정보·사례·비유로 100% 새롭게 창작해야 합니다.
- 참고 블로그 테마: ${benchmarkStyle.blogName}
- 모방할 제목 패턴: ${benchmarkStyle.titlePattern}
- 모방할 문체/어미: ${benchmarkStyle.tone}
- 모방할 본문 전개 구조: ${benchmarkStyle.structure}
- 함께 지킬 주제별 기본 가이드: ${rule}
`
    : `
[작성 모드: 주제별 전용 기본 규칙 모드]
벤치마킹 없이 아래 주제 전용 규칙을 최우선 기준으로 삼아 작성하세요.
- 주제별 필수 규칙: ${rule}
`;

  const prompt = `
당신은 네이버 블로그 홈판(피드) 상위 노출 및 전환율 전문 에디터입니다.
아래 조건에 맞춰 완벽한 블로그 포스팅 패키지를 순수 JSON 형식으로만 출력하세요.

- 선택 주제: ${topicName} (${topic})
- 핵심 키워드/상품: ${keyword}
- 추가 메모/포인트: ${memo || '없음'}
${styleModeInstruction}

[출력 JSON 형식 - 반드시 아래 키 구조만 반환]
{
  "appliedMode": "${benchmarkStyle ? '벤치마킹 구조·말투 복제 창작 모드' : '주제 전용 기본 규칙 모드'}",
  "titles": ["홈판 클릭 유도 제목 1", "제목 2", "제목 3", "제목 4", "제목 5"],
  "body": "가독성 좋게 줄바꿈(\\n\\n)이 적용된 본문 전체 (건강 주제는 공백 제외 1,200자 내외 준수, 쇼핑 커넥트는 제휴 고지 문구 포함)",
  "hashtags": "#태그1 #태그2 #태그3 #태그4 #태그5 #태그6 #태그7 #태그8 #태그9 #태그10",
  "imagePrompts": [
    "1단계 실사 이미지 묘사 (인물·텍스트·워터마크 절대 제외)",
    "2단계 실사 이미지 묘사",
    "3단계 실사 이미지 묘사",
    "4단계 실사 이미지 묘사",
    "5단계 실사 이미지 묘사",
    "6단계 실사 이미지 묘사"
  ]
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      const apiErrMsg = data.error?.message || `HTTP ${response.status} 오류`;
      return res.status(500).json({ error: `Gemini API 오류: ${apiErrMsg}` });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답을 해석하지 못했습니다.');

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
