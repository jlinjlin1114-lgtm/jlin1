export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  // 4대 주제별 모니터링 키워드 풀 (2026년 11월 늦가을·초겨울 시즌 반영)
  const topicPools = {
    health: {
      title: '건강 · 웰니스 실시간 인기 검색어 TOP 10',
      type: 'search',
      keywords: [
        '배도라지즙 효능', '곰보배추차 끓이는법', '공복 혈당 낮추는 음식',
        '쌍화차 부작용', '겨울철 귤 보관법', '율무팩 만들기',
        '단백질 하루 섭취량', '췌장에 좋은 음식', '신장 안좋을때 증상', '올리브오일 공복 섭취'
      ]
    },
    drama: {
      title: '드라마 · 연예 실시간 화제 검색어 TOP 10',
      type: 'search',
      keywords: [
        '재혼 황후 드라마', '유 퀴즈 온 더 블럭', '솔로라서2 출연진',
        '틈만나면 촬영지', '금토드라마 시청률 순위', '넷플릭스 한국 순위',
        '신작 웹툰 원작 드라마', '주말드라마 줄거리 요약', '화제성 1위 배우', '연말 시상식 후보'
      ]
    },
    economy: {
      title: '경제 · 가계금융 실시간 인기 검색어 TOP 10',
      type: 'search',
      keywords: [
        '연말정산 미리보기', '기준금리 동결 전망', '환율 상승 이유',
        '청년 도약계좌 조건', '연금저축펀드 세액공제', 'ISA 계좌 단점',
        '전세대출 금리 비교', '난방비 절약 방법', '배당주 추천 순위', '미국 ETF 세금'
      ]
    },
    shopping: {
      title: '네이버 쇼핑 실시간 인기 검색어 TOP 10',
      type: 'shopping',
      catId: {
        all: '50000008',
        living: '50000008',
        food: '50000006',
        digital: '50000003',
        kids: '50000005'
      }[subCategory] || '50000008',
      keywords: {
        all: ['초음파 가습기', '욕실 틈새 청소솔', '차량용 컵홀더 트레이', '배도라지즙', '온열찜질기', '무선 핸디 청소기', '기모 레깅스', '유산균 추천', '핸드크림 세트', '음식물 처리기'],
        living: ['초음파 가습기', '욕실 틈새 청소솔', '미니 온풍기', '차량용 컵홀더 트레이', '극세사 이불', '규조토 발매트', '자동 센서 휴지통', '옷걸이 정리대', '온열 안대', '주방 수세미'],
        food: ['배도라지즙', '쌍화차 진액', '저당 단백질 쉐이크', '꿀유자차', '생강청', '간편 곰탕', '고구마 말랭이', '유기농 올리브오일', '견과류 하루한봉', '무설탕 그릭요거트'],
        digital: ['맥세이프 보조배터리', '무선 핸디 청소기', 'C타입 고속충전기', '노트북 거치대', '블루투스 키보드', '미니 가습기', '차량용 무선충전 거치대', '손난로 보조배터리', '스마트 체중계', '음식물 처리기'],
        kids: ['초등 수학 오답노트', '어린이 유산균', '키즈 경량패딩', '각도조절 독서대', '어린이 비타민', '학습 타이머', '방한 장갑', '유아 보온병', '어린이 경제 보드게임', '어린이 칫솔']
      }[subCategory] || ['초음파 가습기', '욕실 틈새 청소솔', '차량용 컵홀더 트레이', '배도라지즙', '온열찜질기', '무선 핸디 청소기', '기모 레깅스', '유산균 추천', '핸드크림 세트', '음식물 처리기']
    }
  };

  const current = topicPools[topic] || topicPools.health;

  // 네이버 오픈 API 키가 설정된 경우 실제 데이터랩 검색어/쇼핑인사이트 트렌드 호출
  if (clientId && clientSecret) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - 14);
      const startDate = startDateObj.toISOString().split('T')[0];

      const top5 = current.keywords.slice(0, 5);
      const apiUrl = current.type === 'shopping'
        ? 'https://openapi.naver.com/v1/datalab/shopping/category/keywords'
        : 'https://openapi.naver.com/v1/datalab/search';

      const requestBody = current.type === 'shopping'
        ? {
            startDate,
            endDate,
            timeUnit: 'date',
            category: current.catId,
            keyword: top5.map((kw) => ({ name: kw, param: [kw] }))
          }
        : {
            startDate,
            endDate,
            timeUnit: 'date',
            keywordGroups: top5.map((kw) => ({ groupName: kw, keywords: [kw.split(' ')[0], kw] }))
          };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (data.results) {
        const ranked = data.results
          .map((item) => {
            const latestRatio = item.data?.[item.data.length - 1]?.ratio || 50;
            return {
              keyword: item.title,
              score: Math.round(latestRatio),
              badge: latestRatio >= 80 ? '급상승' : '인기'
            };
          })
          .sort((a, b) => b.score - a.score);

        const rest = current.keywords.slice(5).map((kw, idx) => ({
          keyword: kw,
          score: 76 - idx * 4,
          badge: idx === 0 ? '추천' : '꾸준함'
        }));

        return res.status(200).json({
          panelTitle: current.title,
          source: 'naver_datalab_live',
          items: [...ranked, ...rest]
        });
      }
    } catch (e) {
      // API 오류 시 아래 시즌 큐레이션으로 폴백
    }
  }

  // 기본 반환 데이터
  const items = current.keywords.map((kw, idx) => ({
    keyword: kw,
    score: 99 - idx * 3,
    badge: idx < 2 ? '급상승' : idx < 5 ? '인기' : '스테디'
  }));

  return res.status(200).json({
    panelTitle: current.title,
    source: 'season_curated',
    items
  });
}
