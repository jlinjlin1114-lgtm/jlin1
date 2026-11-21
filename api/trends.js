export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const geminiKey = process.env.GEMINI_API_KEY;
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;

  const topicMeta = {
    health: {
      title: '건강 · 웰니스 실시간 트렌드',
      rssQuery: '건강 의학 식단 영양제 효능',
      promptTopic: '대한민국 건강, 영양, 식재료, 질병 예방, 생활 건강'
    },
    drama: {
      title: '드라마 · 연예 실시간 트렌드',
      rssQuery: '드라마 시청률 예능 연예 화제',
      promptTopic: '대한민국 방영 중인 드라마, 예능, OTT 화제작, 연예계 이슈'
    },
    economy: {
      title: '경제 · 가계금융 실시간 트렌드',
      rssQuery: '경제 금리 부동산 세금 생활물가',
      promptTopic: '대한민국 경제, 금리, 연말정산, 생활물가, 재테크 이슈'
    },
    shopping: {
      title: '네이버 쇼핑 실시간 인기 트렌드',
      rssQuery: {
        all: '생활용품 추천 가전 인기템',
        living: '리빙 인테리어 청소용품 추천',
        food: '건강식품 간식 제철음식 추천',
        digital: '소형가전 IT기기 추천',
        kids: '육아용품 초등 준비물 추천'
      }[subCategory] || '생활용품 추천 인기템',
      promptTopic: {
        all: '한국 온라인 쇼핑몰 및 네이버 쇼핑 전체 인기 급상승 상품',
        living: '한국 네이버 쇼핑 생활·건강·리빙·청소 인기 급상승 상품',
        food: '한국 네이버 쇼핑 식품·건강식품·제철 먹거리 인기 급상승 상품',
        digital: '한국 네이버 쇼핑 디지털·소형가전 인기 급상승 상품',
        kids: '한국 네이버 쇼핑 출산·육아·초등학생 인기 급상승 상품'
      }[subCategory] || '한국 네이버 쇼핑 인기 급상승 상품'
    }
  };

  const current = topicMeta[topic] || topicMeta.health;
  let liveArticles = [];
  let sourceLabel = '실시간 웹 피드';

  // 1단계: 네이버 검색 API 키가 등록되어 있으면 네이버 실시간 뉴스/블로그 호출
  if (naverId && naverSecret) {
    try {
      const endpoint = topic === 'shopping'
        ? `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(current.rssQuery)}&display=8&sort=date`
        : `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(current.rssQuery)}&display=8&sort=sim`;

      const nRes = await fetch(endpoint, {
        headers: {
          'X-Naver-Client-Id': naverId,
          'X-Naver-Client-Secret': naverSecret
        }
      });
      const nData = await nRes.json();
      if (nData.items && nData.items.length > 0) {
        const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
        liveArticles = nData.items.map((it) => ({
          title: clean(it.title),
          source: topic === 'shopping' ? (it.bloggername || '네이버블로그') : '네이버 실시간',
          summary: clean(it.description),
          link: it.link
        }));
        sourceLabel = '네이버 실시간 API';
      }
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 2단계: 구글 뉴스 한국판 실시간 RSS 피드 수집 (API 키 없이도 항상 최신 외부 기사 확보)
  if (liveArticles.length === 0) {
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(current.rssQuery)}&hl=ko&gl=KR&ceid=KR:ko`;
      const rssRes = await fetch(rssUrl);
      const xml = await rssRes.text();

      const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
      liveArticles = itemMatches.map((m) => {
        const block = m[1];
        const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '실시간 랭킹';
        const cleanTitle = rawTitle.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/ - [^-]+$/, '').trim();
        return {
          title: cleanTitle,
          source: source.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          summary: `${source}에서 주목받고 있는 최신 화제 이슈입니다.`,
          link: link.trim()
        };
      }).filter((a) => a.title);

      if (liveArticles.length > 0) {
        sourceLabel = '실시간 뉴스 랭킹 피드';
      }
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 3단계: Gemini API + Google 실시간 검색으로 오늘의 실시간 TOP 10 키워드 추출
  if (geminiKey) {
    try {
      const headlinesContext = liveArticles.length > 0
        ? `현재 수집된 실시간 헤드라인 목록:\n${liveArticles.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}`
        : '현재 대한민국 최신 검색 트렌드를 실시간으로 조회하세요.';

      const prompt = `
당신은 대한민국 실시간 트렌드 분석기입니다.
분야: ${current.promptTopic}
${headlinesContext}

위 최신 흐름과 현재 대한민국 실시간 검색 트렌드를 바탕으로, 블로거가 지금 바로 쓰기 좋은 인기 검색어 TOP 10을 추출하세요.
${liveArticles.length === 0 ? '또한 현재 화제가 되고 있는 인기 랭킹 글 6개도 함께 생성하세요.' : ''}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "keywords": [
    {"keyword": "인기 검색어 1", "badge": "급상승"},
    {"keyword": "인기 검색어 2", "badge": "급상승"},
    {"keyword": "인기 검색어 3", "badge": "인기"},
    {"keyword": "인기 검색어 4", "badge": "인기"},
    {"keyword": "인기 검색어 5", "badge": "인기"},
    {"keyword": "인기 검색어 6", "badge": "화제"},
    {"keyword": "인기 검색어 7", "badge": "화제"},
    {"keyword": "인기 검색어 8", "badge": "상승"},
    {"keyword": "인기 검색어 9", "badge": "상승"},
    {"keyword": "인기 검색어 10", "badge": "추천"}
  ]${liveArticles.length === 0 ? `,
  "articles": [
    {"title": "최신 랭킹 글 제목", "source": "실시간 트렌드", "summary": "핵심 요약 한 줄"}
  ]` : ''}
}
`;

      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7
            }
          })
        }
      );

      const gData = await gRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const finalArticles = liveArticles.length > 0 ? liveArticles : (parsed.articles || []);
        return res.status(200).json({
          panelTitle: current.title,
          source: 'naver_live_api',
          items: parsed.keywords || [],
          rankingArticles: finalArticles
        });
      }
    } catch (e) {
      // Gemini 호출 실패 시 수집된 헤드라인에서 직접 키워드 구성
    }
  }

  // 만약 위 과정이 모두 지연될 경우 수집된 실시간 헤드라인 기반으로 즉시 구성
  const fallbackKeywords = liveArticles.slice(0, 10).map((a, idx) => ({
    keyword: a.title.split(/[,\-·]/)[0].trim().slice(0, 18),
    badge: idx < 2 ? '급상승' : '인기'
  }));

  return res.status(200).json({
    panelTitle: current.title,
    source: sourceLabel,
    items: fallbackKeywords,
    rankingArticles: liveArticles
  });
}
