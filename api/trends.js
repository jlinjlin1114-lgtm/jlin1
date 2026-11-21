export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const geminiKey = process.env.GEMINI_API_KEY;
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;

  const topicMeta = {
    health: {
      title: '건강 · 웰니스 실시간 트렌드',
      sourceType: 'blog',
      query: '건강 효능 식단 관리 후기',
      autoSeeds: ['겨울철 건강관리', '혈당 낮추는', '면역력 영양제', '기관지에 좋은', '피로회복 음식'],
      keywordPrompt: '현재 대한민국 사람들이 네이버 검색창에 많이 검색하는 건강·영양·식재료·생활건강 관련 짧은 핵심 검색 키워드(2~10자) 10개'
    },
    drama: {
      title: '드라마 · 연예 실시간 트렌드',
      sourceType: 'news',
      query: '드라마 시청률 예능 연예 화제',
      autoSeeds: ['신작 드라마', '주말드라마', '예능 프로그램', '넷플릭스 순위', '화제성 1위'],
      keywordPrompt: '현재 대한민국 사람들이 네이버 검색창에 많이 검색하는 방영 중인 드라마, 예능, 연예 화제 검색 키워드(2~10자) 10개'
    },
    economy: {
      title: '경제 · 가계금융 실시간 트렌드',
      sourceType: 'news',
      query: '경제 금리 부동산 세금 생활물가',
      autoSeeds: ['연말정산', '기준금리', '지원금 신청', 'ISA 계좌', '절세 방법'],
      keywordPrompt: '현재 대한민국 사람들이 네이버 검색창에 많이 검색하는 경제, 금리, 연말정산, 지원금, 재테크 관련 짧은 검색 키워드(2~10자) 10개'
    },
    shopping: {
      title: '네이버 쇼핑 실시간 트렌드',
      sourceType: 'blog',
      query: {
        all: '생활꿀템 추천 내돈내산 후기',
        living: '살림템 청소용품 추천 후기',
        food: '건강식품 간식 추천 내돈내산',
        digital: '소형가전 IT기기 추천 후기',
        kids: '육아템 초등 준비물 추천 후기'
      }[subCategory] || '생활꿀템 추천 내돈내산 후기',
      autoSeeds: {
        all: ['겨울 가습기', '욕실 청소용품', '무선 청소기', '온열 찜질기', '생활 꿀템'],
        living: ['초음파 가습기', '욕실 청소솔', '미니 온풍기', '주방 정리템', '극세사 이불'],
        food: ['배도라지즙', '쌍화차', '단백질 쉐이크', '건강 간식', '제철 과일'],
        digital: ['보조배터리', '핸디 청소기', '고속충전기', '노트북 거치대', '손난로'],
        kids: ['어린이 유산균', '초등 문제집', '키즈 패딩', '독서대', '학습 타이머']
      }[subCategory] || ['겨울 가습기', '욕실 청소용품', '생활 꿀템'],
      keywordPrompt: {
        all: '현재 네이버 쇼핑에서 검색량이 급증하는 인기 생활·가전·식품 상품명 키워드 10개',
        living: '현재 네이버 쇼핑에서 검색량이 급증하는 리빙·청소·인테리어 상품명 키워드 10개',
        food: '현재 네이버 쇼핑에서 검색량이 급증하는 건강식품·간식·제철식품 상품명 키워드 10개',
        digital: '현재 네이버 쇼핑에서 검색량이 급증하는 소형가전·디지털기기 상품명 키워드 10개',
        kids: '현재 네이버 쇼핑에서 검색량이 급증하는 출산·육아·초등학생용품 상품명 키워드 10개'
      }[subCategory] || '현재 네이버 쇼핑에서 검색량이 급증하는 인기 상품명 키워드 10개'
    }
  };

  const current = topicMeta[topic] || topicMeta.health;
  const isBlogMode = current.sourceType === 'blog';
  let collectedArticles = [];
  let topKeywords = [];
  let sourceLabel = isBlogMode ? '네이버 블로그 인기 피드' : '실시간 인기 뉴스 랭킹';

  if (naverId && naverSecret) {
    try {
      const apiPath = isBlogMode ? 'blog.json' : 'news.json';
      const endpoint = `https://openapi.naver.com/v1/search/${apiPath}?query=${encodeURIComponent(current.query)}&display=8&sort=sim`;
      const nRes = await fetch(endpoint, {
        headers: {
          'X-Naver-Client-Id': naverId,
          'X-Naver-Client-Secret': naverSecret
        }
      });
      const nData = await nRes.json();
      if (nData.items && nData.items.length > 0) {
        const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
        collectedArticles = nData.items.map((it) => ({
          title: clean(it.title),
          source: isBlogMode ? `${clean(it.bloggername || '네이버블로그')} 블로그` : '네이버 실시간 뉴스',
          summary: clean(it.description),
          link: it.link
        }));
        sourceLabel = isBlogMode ? '네이버 블로그 실시간 API' : '네이버 뉴스 실시간 API';
      }
    } catch (e) {}
  }

  if (collectedArticles.length === 0) {
    try {
      const searchQuery = isBlogMode ? `site:blog.naver.com ${current.query}` : current.query;
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=ko&gl=KR&ceid=KR:ko`;
      const rssRes = await fetch(rssUrl);
      const xml = await rssRes.text();

      const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
      collectedArticles = itemMatches.map((m) => {
        const block = m[1];
        const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const rawSource = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';

        const cleanTitle = rawTitle
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .replace(/ : 네이버 블로그.*$/, '')
          .replace(/ - 네이버 블로그.*$/, '')
          .replace(/ - [^-]+$/, '')
          .trim();

        const pressName = rawSource.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

        return {
          title: cleanTitle,
          source: isBlogMode ? '네이버 인기 블로그' : (pressName || '실시간 인기 뉴스'),
          summary: isBlogMode
            ? '네이버 블로그에서 검색 유입이 활발한 인기 포스팅입니다.'
            : `${pressName || '주요 언론'}에서 주목받고 있는 실시간 인기 뉴스입니다.`,
          link: link.trim()
        };
      }).filter((a) => a.title);
    } catch (e) {}
  }

  if (geminiKey) {
    try {
      const prompt = `
Google 실시간 검색을 활용해 2026년 11월 오늘 기준 "${current.keywordPrompt}"을 조사하세요.
문장형 제목이 아니라 사용자가 검색창에 실제로 입력하는 짧은 핵심 키워드(2~10자 이내) 10개만 뽑아주세요.

반드시 다른 설명 없이 아래 순수 JSON 형태로만 출력하세요:
{
  "keywords": [
    {"keyword": "키워드1", "badge": "급상승"},
    {"keyword": "키워드2", "badge": "급상승"},
    {"keyword": "키워드3", "badge": "인기"},
    {"keyword": "키워드4", "badge": "인기"},
    {"keyword": "키워드5", "badge": "인기"},
    {"keyword": "키워드6", "badge": "화제"},
    {"keyword": "키워드7", "badge": "화제"},
    {"keyword": "키워드8", "badge": "상승"},
    {"keyword": "키워드9", "badge": "상승"},
    {"keyword": "키워드10", "badge": "추천"}
  ]
}
`;

      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.75 }
          })
        }
      );

      const gData = await gRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
          topKeywords = parsed.keywords.slice(0, 10);
        }
      }
    } catch (e) {}
  }

  if (topKeywords.length === 0) {
    try {
      const collectedKw = new Set();
      for (const seed of current.autoSeeds) {
        if (collectedKw.size >= 10) break;
        const acRes = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(seed)}`
        );
        const acData = await acRes.json();
        const suggestions = acData[1] || [];
        for (const s of suggestions) {
          if (s && s.length <= 16 && collectedKw.size < 10) {
            collectedKw.add(s.trim());
          }
        }
      }
      topKeywords = [...collectedKw].map((kw, idx) => ({
        keyword: kw,
        badge: idx < 2 ? '급상승' : idx < 5 ? '인기' : '추천'
      }));
    } catch (e) {}
  }

  return res.status(200).json({
    panelTitle: current.title,
    source: sourceLabel,
    items: topKeywords,
    rankingArticles: collectedArticles
  });
}
