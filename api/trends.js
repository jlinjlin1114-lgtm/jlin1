export default async function handler(req, res) {
  const { topic = 'health', subCategory = 'all' } = req.query;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  const topicPools = {
    health: {
      title: '건강 · 웰니스 실시간 트렌드',
      searchQuery: '건강 효능 식단 관리',
      keywords: [
        '배도라지즙 효능', '곰보배추차 끓이는법', '공복 혈당 낮추는 음식',
        '쌍화차 부작용', '겨울철 귤 보관법', '율무팩 만들기',
        '단백질 하루 섭취량', '췌장에 좋은 음식', '신장 안좋을때 증상', '올리브오일 공복 섭취'
      ],
      fallbackArticles: [
        { title: '아침 공복에 물 대신 마셨더니 혈당 스파이크 싹 잡힌 의외의 차', source: '건강랭킹', summary: '식후 혈당 급상승을 막아주는 천연 식재료와 섭취 타이밍 정리' },
        { title: '환절기마다 목 칼칼할 때 배도라지즙보다 먼저 챙겨야 할 이것', source: '웰니스피드', summary: '기관지 점막 보호를 돕는 따뜻한 수분 섭취와 생활 습관' },
        { title: '40대 이후 뱃살 안 빠지는 진짜 이유, 저녁 식단 순서만 바꿨더니', source: '건강홈판', summary: '채소-단백질-탄수화물 거꾸로 식사법의 실제 변화' },
        { title: '냉장고에 귤 그냥 넣지 마세요, 끝까지 무르지 않는 보관 비법', source: '생활건강', summary: '신문지와 소금물 세척을 활용한 겨울 제철 과일 신선 보관법' },
        { title: '피곤할 때마다 붓는 얼굴과 다리, 짠 음식 줄이는 현실적인 방법', source: '건강트렌드', summary: '나트륨 배출을 돕는 칼륨 풍부 채소와 국물 줄이기 팁' }
      ]
    },
    drama: {
      title: '드라마 · 연예 실시간 트렌드',
      searchQuery: '드라마 시청률 화제성 반응',
      keywords: [
        '재혼 황후 드라마', '유 퀴즈 온 더 블럭', '솔로라서2 출연진',
        '틈만나면 촬영지', '금토드라마 시청률 순위', '넷플릭스 한국 순위',
        '신작 웹툰 원작 드라마', '주말드라마 줄거리 요약', '화제성 1위 배우', '연말 시상식 후보'
      ],
      fallbackArticles: [
        { title: '첫 방송 시청률 2%대였는데 입소문 터지며 주말 안방 휩쓴 드라마', source: '연예랭킹', summary: '반전 엔딩과 주연 배우들의 탄탄한 연기력으로 역주행 중인 화제작' },
        { title: '원작 웹툰 팬들도 싱크로율 200%라며 환호한 캐스팅 비하인드', source: '드라마피드', summary: '캐릭터 설정과 명장면 구현으로 화제를 모은 방영 직후 반응' },
        { title: '유퀴즈 출연 후 25년 인연 영상 재조명되며 눈물바다 만든 사연', source: '예능화제', summary: '방송 직후 온라인 커뮤니티를 뜨겁게 달군 진솔한 토크 장면' },
        { title: '촬영지 어디냐고 문의 폭주한 주말 예능 속 숨은 로컬 맛집과 카페', source: '방송트렌드', summary: '방영 직후 주말 나들이 코스로 급부상한 방송 속 명소 정리' },
        { title: '연말 연기대상 유력 후보로 거론되는 올해의 인생 캐릭터 3인', source: '연예이슈', summary: '화제성과 시청률을 모두 잡으며 신드롬을 일으킨 주역들' }
      ]
    },
    economy: {
      title: '경제 · 가계금융 실시간 트렌드',
      searchQuery: '경제 금리 연말정산 물가',
      keywords: [
        '연말정산 미리보기', '기준금리 동결 전망', '환율 상승 이유',
        '청년 도약계좌 조건', '연금저축펀드 세액공제', 'ISA 계좌 단점',
        '전세대출 금리 비교', '난방비 절약 방법', '배당주 추천 순위', '미국 ETF 세금'
      ],
      fallbackArticles: [
        { title: '연말정산 환급금 100만 원 더 챙기는 11월 막판 체크리스트', source: '경제랭킹', summary: '신용카드·체크카드 황금비율과 연금계좌 세액공제 한도 점검' },
        { title: '금리 인하기 접어들며 예적금 만기 자금 몰리는 배당 ETF 특징', source: '금융피드', summary: '안정적인 월배당 현금흐름을 원하는 직장인 투자 트렌드' },
        { title: '올겨울 난방비 폭탄 피하려면 보일러 외출 모드 대신 이렇게 하세요', source: '생활경제', summary: '단열 뽁뽁이와 적정 실내온도 유지로 관리비 아끼는 실전 팁' },
        { title: '장바구니 물가 비상, 대형마트·전통시장 알뜰 장보기 핵심 요령', source: '가계이슈', summary: '제철 식재료 활용과 포인트 적립으로 식비 고정지출 줄이기' },
        { title: 'ISA 계좌 서민형 전환 조건 놓치면 손해 보는 비과세 혜택 차이', source: '재테크홈판', summary: '만기 자금 연금전환 추가 세액공제까지 한눈에 정리' }
      ]
    },
    shopping: {
      title: '네이버 쇼핑 실시간 인기 트렌드',
      searchQuery: '생활꿀템 추천 후기',
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
      }[subCategory] || ['초음파 가습기', '욕실 틈새 청소솔', '차량용 컵홀더 트레이', '배도라지즙', '온열찜질기', '무선 핸디 청소기', '기모 레깅스', '유산균 추천', '핸드크림 세트', '음식물 처리기'],
      fallbackArticles: [
        { title: '물때 낀 욕실 줄눈 락스 없이 3분 만에 닦아낸 틈새 청소솔 후기', source: '쇼핑인기', summary: '손목 힘 안 들이고 구석구석 닦이는 사선 브러시 실사용기' },
        { title: '아침마다 목 따가웠는데 침대 옆에 두고 삶의 질 바뀐 가열식 가습기', source: '리빙랭킹', summary: '세척 간편하고 밤새 촉촉하게 유지되는 겨울 필수 가전' }
      ]
    }
  };

  const current = topicPools[topic] || topicPools.health;
  let rankingArticles = current.fallbackArticles;
  let sourceType = 'season_curated';

  // 네이버 오픈 API 키가 있으면 실제 네이버 인기 뉴스/블로그 랭킹 글 실시간 조회
  if (clientId && clientSecret) {
    try {
      const searchEndpoint = topic === 'shopping'
        ? `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(current.searchQuery)}&display=8&sort=sim`
        : `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(current.searchQuery)}&display=8&sort=sim`;

      const naverRes = await fetch(searchEndpoint, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        }
      });
      const naverData = await naverRes.json();

      if (naverData.items && naverData.items.length > 0) {
        const cleanHtml = (str) => str.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
        rankingArticles = naverData.items.map((item) => ({
          title: cleanHtml(item.title),
          source: topic === 'shopping' ? (item.bloggername || '네이버블로그') : '네이버뉴스 랭킹',
          summary: cleanHtml(item.description),
          link: item.link
        }));
        sourceType = 'naver_live_api';
      }
    } catch (e) {
      // 실패 시 fallbackArticles 유지
    }
  }

  const items = current.keywords.map((kw, idx) => ({
    keyword: kw,
    score: 99 - idx * 3,
    badge: idx < 2 ? '급상승' : idx < 5 ? '인기' : '스테디'
  }));

  return res.status(200).json({
    panelTitle: current.title,
    source: sourceType,
    items,
    rankingArticles
  });
}
