export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const geminiKey = process.env.GEMINI_API_KEY;
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;

  // 주제별 수집 소스 분기: health(블로그), drama(뉴스), economy(뉴스), shopping(블로그)
  const topicMeta = {
    health: {
      title: '건강 · 웰니스 인기 블로그 트렌드',
      sourceType: 'blog',
      query: '건강 효능 식단 관리 후기',
      promptTopic: '네이버 블로그 건강·영양·식재료·생활건강 분야 인기 유입글'
    },
    drama: {
      title: '드라마 · 연예 실시간 인기 뉴스',
      sourceType: 'news',
      query: '드라마 시청률 예능 연예 화제',
      promptTopic: '대한민국 실시간 인기 연예·드라마·방송 뉴스 랭킹'
    },
    economy: {
      title: '경제 · 가계금융 실시간 인기 뉴스',
      sourceType: 'news',
      query: '경제 금리 부동산 세금 생활물가',
      promptTopic: '대한민국 실시간 인기 경제·금융·생활물가·정책 뉴스 랭킹'
    },
    shopping: {
      title: '네이버 쇼핑 인기 후기·추천 블로그',
      sourceType: 'blog',
      query: {
        all: '생활꿀템 추천 내돈내산 후기',
        living: '살림템 청소용품 추천 후기',
        food: '건강식품 간식 추천 내돈내산',
        digital: '소형가전 IT기기 추천 후기',
        kids: '육아템 초등 준비물 추천 후기'
      }[subCategory] || '생활꿀템 추천 내돈내산 후기',
      promptTopic: {
        all: '네이버 블로그 쇼핑·생활꿀템 내돈내산 인기 후기글',
        living: '네이버 블로그 살림·리빙·청소용품 인기 추천글',
        food: '네이버 블로그 식품·건강식품·제철 먹거리 인기 추천글',
        digital: '네이버 블로그 소형가전·디지털기기 인기 사용후기',
        kids: '네이버 블로그 출산·육아·초등학생용품 인기 추천글'
      }[subCategory] || '네이버 블로그 쇼핑 내돈내산 인기 후기글'
    }
  };

  const current = topicMeta[topic] || topicMeta.health;
  const isBlogMode = current.sourceType === 'blog';
  let collectedArticles = [];
  let sourceLabel = isBlogMode ? '네이버 블로그 인기 피드' : '실시간 인기 뉴스 랭킹';

  // 1순위: 네이버 검색 API (건강·쇼핑은 blog.json / 드라마·경제는 news.json 호출)
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
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 2순위: 웹 RSS 피드 수집 (건강·쇼핑은 site:blog.naver.com / 드라마·경제는 실시간 뉴스 피드)
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
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 3순위: Gemini + Google 실시간 검색으로 각 소스 성격에 맞는 TOP 10 키워드 추출
  if (geminiKey) {
    try {
      const contextText = collectedArticles.length > 0
        ? `현재 수집된 실제 ${isBlogMode ? '네이버 블로그 인기글' : '실시간 인기 뉴스'} 목록:\n${collectedArticles.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}`
        : `Google 실시간 검색으로 실제 '${isBlogMode ? 'site:blog.naver.com 인기 블로그 글' : '대한민국 최신 인기 뉴스'}'을 찾아 참고하세요.`;

      const prompt = `
당신은 대한민국 실시간 콘텐츠 트렌드 분석가입니다.
주제 분야: ${current.promptTopic}
데이터 기준: ${isBlogMode ? '실제 네이버 블로거들이 많이 다루고 검색 유입이 터지는 블로그 인기글 기준' : '실시간 화제성이 높은 인기 뉴스 랭킹 기준'}
${contextText}

위 흐름을 바탕으로 지금 바로 블로그 원고 주제로 쓰기 좋은 인기 검색어 TOP 10을 추출하세요.
${collectedArticles.length === 0 ? `또한 ${isBlogMode ? '네이버 인기 블로그 포스팅' : '실시간 인기 뉴스 랭킹 글'} 8개도 함께 구성하세요.` : ''}

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
  ]${collectedArticles.length === 0 ? `,
  "articles": [
    {"title": "제목", "source": "${isBlogMode ? '네이버 인기 블로그' : '실시간 인기 뉴스'}", "summary": "핵심 포인트 요약 한 줄"}
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
              temperature: 0.75
            }
          })
        }
      );

      const gData = await gRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const finalArticles = collectedArticles.length > 0 ? collectedArticles : (parsed.articles || []);
        return res.status(200).json({
          panelTitle: current.title,
          source: sourceLabel,
          items: parsed.keywords || [],
          rankingArticles: finalArticles
        });
      }
    } catch (e) {
      // Gemini 오류 시 수집된 목록에서 키워드 구성
    }
  }

  const fallbackKeywords = collectedArticles.slice(0, 10).map((a, idx) => ({
    keyword: a.title.split(/[,\-·?!]/)[0].trim().slice(0, 18),
    badge: idx < 2 ? '급상승' : '인기'
  }));

  return res.status(200).json({
    panelTitle: current.title,
    source: sourceLabel,
    items: fallbackKeywords,
    rankingArticles: collectedArticles
  });
}
