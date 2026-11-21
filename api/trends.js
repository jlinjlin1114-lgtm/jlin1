export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const geminiKey = process.env.GEMINI_API_KEY;
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;

  const topicMeta = {
    health: {
      title: '건강 · 웰니스 인기 블로그 트렌드',
      blogQuery: '건강 효능 관리 후기',
      promptTopic: '네이버 블로그 건강·영양·식재료·생활건강 분야 인기 유입글'
    },
    drama: {
      title: '드라마 · 연예 인기 블로그 트렌드',
      blogQuery: '드라마 리뷰 줄거리 결말 반응',
      promptTopic: '네이버 블로그 드라마·예능·OTT 리뷰 및 연예 화제 인기 유입글'
    },
    economy: {
      title: '경제 · 가계금융 인기 블로그 트렌드',
      blogQuery: '재테크 절약 지원금 연말정산 정리',
      promptTopic: '네이버 블로그 재테크·생활경제·지원금·세금 정리 인기 유입글'
    },
    shopping: {
      title: '네이버 쇼핑 내돈내산·추천 블로그 트렌드',
      blogQuery: {
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
  let blogArticles = [];
  let sourceLabel = '네이버 블로그 인기 피드';

  // 1순위: 네이버 검색 API(블로그 전용 blog.json) 호출
  if (naverId && naverSecret) {
    try {
      const endpoint = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(current.blogQuery)}&display=8&sort=sim`;
      const nRes = await fetch(endpoint, {
        headers: {
          'X-Naver-Client-Id': naverId,
          'X-Naver-Client-Secret': naverSecret
        }
      });
      const nData = await nRes.json();
      if (nData.items && nData.items.length > 0) {
        const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
        blogArticles = nData.items.map((it) => ({
          title: clean(it.title),
          source: `${clean(it.bloggername || '네이버블로그')} 블로그`,
          summary: clean(it.description),
          link: it.link
        }));
        sourceLabel = '네이버 블로그 실시간 API';
      }
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 2순위: 네이버 블로그 전용 웹 피드(site:blog.naver.com) 수집
  if (blogArticles.length === 0) {
    try {
      const blogRssQuery = `site:blog.naver.com ${current.blogQuery}`;
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(blogRssQuery)}&hl=ko&gl=KR&ceid=KR:ko`;
      const rssRes = await fetch(rssUrl);
      const xml = await rssRes.text();

      const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
      blogArticles = itemMatches.map((m) => {
        const block = m[1];
        const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const cleanTitle = rawTitle
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .replace(/ : 네이버 블로그.*$/, '')
          .replace(/ - 네이버 블로그.*$/, '')
          .trim();
        return {
          title: cleanTitle,
          source: '네이버 인기 블로그',
          summary: '네이버 블로그에서 검색 유입이 활발한 인기 포스팅입니다.',
          link: link.trim()
        };
      }).filter((a) => a.title);
    } catch (e) {
      // 다음 단계로 폴백
    }
  }

  // 3순위: Gemini + Google 실시간 검색으로 현재 인기 네이버 블로그 글 및 TOP 10 키워드 추출
  if (geminiKey) {
    try {
      const blogContext = blogArticles.length > 0
        ? `현재 수집된 실제 네이버 블로그 인기글 제목:\n${blogArticles.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}`
        : `Google 검색으로 실제 'site:blog.naver.com'의 최신 인기 블로그 포스팅을 찾아 참고하세요.`;

      const prompt = `
당신은 네이버 블로그 홈판(피드) 및 상위노출 키워드 전문 분석가입니다.
주제 분야: ${current.promptTopic}
${blogContext}

위 실제 블로그 흐름과 현재 대한민국 블로거들 사이에서 조회수가 높은 인기 주제를 바탕으로,
뉴스 기사 스타일이 아닌 '실제 블로거들이 많이 쓰고 클릭이 잘 나오는 블로그 검색 키워드 TOP 10'을 추출하세요.
${blogArticles.length === 0 ? "또한 실제 네이버 블로그 인기글 스타일의 추천 포스팅 8개(제목, 블로거 분위기, 핵심 요약)도 함께 구성하세요." : ""}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "keywords": [
    {"keyword": "블로그 인기 키워드 1", "badge": "급상승"},
    {"keyword": "블로그 인기 키워드 2", "badge": "급상승"},
    {"keyword": "블로그 인기 키워드 3", "badge": "인기"},
    {"keyword": "블로그 인기 키워드 4", "badge": "인기"},
    {"keyword": "블로그 인기 키워드 5", "badge": "인기"},
    {"keyword": "블로그 인기 키워드 6", "badge": "유입꿀"},
    {"keyword": "블로그 인기 키워드 7", "badge": "유입꿀"},
    {"keyword": "블로그 인기 키워드 8", "badge": "상승"},
    {"keyword": "블로그 인기 키워드 9", "badge": "상승"},
    {"keyword": "블로그 인기 키워드 10", "badge": "추천"}
  ]${blogArticles.length === 0 ? `,
  "articles": [
    {"title": "실제 네이버 블로그 스타일 인기 제목", "source": "네이버 인기 블로그", "summary": "블로그 본문 핵심 포인트 요약 한 줄"}
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
        const finalArticles = blogArticles.length > 0 ? blogArticles : (parsed.articles || []);
        return res.status(200).json({
          panelTitle: current.title,
          source: sourceLabel,
          items: parsed.keywords || [],
          rankingArticles: finalArticles
        });
      }
    } catch (e) {
      // Gemini 오류 시 수집된 블로그 목록에서 키워드 구성
    }
  }

  const fallbackKeywords = blogArticles.slice(0, 10).map((a, idx) => ({
    keyword: a.title.split(/[,\-·?!]/)[0].trim().slice(0, 18),
    badge: idx < 2 ? '급상승' : '인기'
  }));

  return res.status(200).json({
    panelTitle: current.title,
    source: sourceLabel,
    items: fallbackKeywords,
    rankingArticles: blogArticles
  });
}
