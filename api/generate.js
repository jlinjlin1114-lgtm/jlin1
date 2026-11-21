export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { topic, topicName, keyword, memo, rule, benchmarkStyle } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  const benchmarkInstruction = benchmarkStyle
    ? `\n[벤치마킹 블로그 스타일 복제 지침]\n- 제목 패턴: ${benchmarkStyle.titlePattern}\n- 문체 및 어미: ${benchmarkStyle.tone}\n- 본문 전개 구조: ${benchmarkStyle.structure}\n위 벤치마킹 블로그의 호흡과 후킹 감각을 반드시 반영하여 작성하세요.`
    : '';

  const prompt = `
당신은 네이버 블로그 홈판(피드) 상위 노출 및 전환율 전문 에디터입니다.
아래 조건에 맞춰 완벽한 블로그 포스팅 패키지를 JSON 형식으로만 출력하세요.

- 선택 주제: ${topicName} (${topic})
- 핵심 키워드/상품: ${keyword}
- 추가 메모/포인트: ${memo || '없음'}
- 주제별 필수 규칙: ${rule}
${benchmarkInstruction}

[출력 JSON 형식 - 반드시 아래 키 구조만 반환]
{
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.75
          }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI 응답이 비어있습니다.');

    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
