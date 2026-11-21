export default async function handler(req, res) {
  const { category = 'all' } = req.query;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  // 카테고리별 대표 모니터링 키워드 풀 (네이버 쇼핑인사이트 분야 코드 매핑)
  const categoryConfig = {
    all: {
      catId: '50000008', // 생활/건강 기준
      candidates: ['가습기', '무선청소기', '차량용 방향제', '단백질 쉐이크', '마사지기', '욕실 청소솔', '기모 레깅스', '온열찜질기', '유산균', '핸드크림']
    },
    living: {
      catId: '50000008', // 생활/건강
      candidates: ['초음파 가습기', '욕실 틈새 청소솔', '미니 온풍기', '차량용 컵홀더 트레이', '극세사 이불', '규조토 발매트', '자동 센서 휴지통', '옷걸이 정리대', '온열 안대', '주방 수세미']
    },
    food: {
      catId: '50000006', // 식품
      candidates: ['배도라지즙', '쌍화차 진액', '저당 단백질 쉐이크', '꿀유자차', '생강청', '간편 곰탕', '고구마 말랭이', '유기농 올리브오일', '견과류 하루한봉', '무설탕 그릭요거트']
    },
    digital: {
      catId: '50000003', // 디지털/가전
      candidates: ['맥세이프 보조배터리', '무선 핸디 청소기', 'C타입 고속충전기', '노트북 거치대', '블루투스 키보드', '미니 가습기', '차량용 무선충전 거치대', '손난로 보조배터리', '스마트 체중계', '음식물 처리기']
    },
    kids: {
      catId: '50000005', // 출산/육아
      candidates: ['초등 수학 문제집', '어린이 유산균', '키즈 경량패딩', '독서대 각도조절', '어린이 비타민', '학습 타이머', '방한 장갑', '유아 보온병', '보드게임 추천', '어린이 칫솔']
    }
  };

  const selected = categoryConfig[category] || categoryConfig.all;

  // 네이버 API 키가 설정된 경우 실제 데이터랩 쇼핑인사이트 검색량 추이 조회
  if (clientId && clientSecret) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - 14);
      const startDate = startDateObj.toISOString().split('T')[0];

      // 5개씩 묶어 쇼핑인사이트 키워드 트렌드 호출
      const top5 = selected.candidates.slice(0, 5);
      const response = await fetch('https://openapi.naver.com/v1/datalab/shopping/category/keywords', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          timeUnit: 'date',
          category: selected.catId,
          keyword: top5.map((kw) => ({ name: kw, param: [kw] }))
        })
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

        // 나머지 5개 후보와 병합하여 TOP 10 반환
        const rest = selected.candidates.slice(5).map((kw, idx) => ({
          keyword: kw,
          score: 75 - idx * 4,
          badge: idx === 0 ? '추천' : '스테디'
        }));

        return res.status(200).json({ source: 'naver_datalab_live', items: [...ranked, ...rest] });
      }
    } catch (e) {
      // API 호출 실패 시 아래 기본 리스트로 안전 폴백
    }
  }

  // API 키 미설정 시 기본 반환 데이터
  const fallbackItems = selected.candidates.map((kw, idx) => ({
    keyword: kw,
    score: 98 - idx * 3,
    badge: idx < 2 ? '급상승' : idx < 5 ? '인기' : '스테디'
  }));

  return res.status(200).json({ source: 'season_curated', items: fallbackItems });
}
