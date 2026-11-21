export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { messages, currentDraft, topicName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  }

  const systemContext = `당신은 사용자의 네이버 블로그 운영 전담 AI 파트너입니다.
친근하고 다정하며 글이 술술 읽히도록 답변해 주세요.
현재 선택된 카테고리: ${topicName || '일반'}
${currentDraft ? `\n[현재 작업 중인 원고 참고]\n제목: ${currentDraft.title}\n본문:\n${currentDraft.body}\n\n사용자가 위 원고의 수정, 제목 변형, 문단 다듬기, 추가 아이디어를 요청하면 즉시 반영해 제안해 주세요.` : ''}`;

  const contents = (messages || []).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemContext }] },
          contents,
          generationConfig: { temperature: 0.75 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok || data.error) {
      const msg = data.error?.message || `HTTP ${response.status}`;
      return res.status(500).json({ error: `Gemini 채팅 오류: ${msg}` });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성하지 못했습니다.';
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: `채팅 오류: ${err.message}` });
  }
}
