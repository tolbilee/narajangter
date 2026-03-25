// =====================================================
// Supabase 설정 파일
// =====================================================
// 
// 이 파일에 본인의 Supabase 프로젝트 정보를 입력하세요.
// 
// Supabase URL과 API Key 확인 방법:
// 1. Supabase 대시보드 접속 (https://app.supabase.com)
// 2. 프로젝트 선택
// 3. Settings > API 메뉴 클릭
// 4. Project URL과 anon public 키 복사
// =====================================================

// ⚠️ 여기에 본인의 Supabase 정보를 입력하세요 ⚠️
const SUPABASE_URL = 'https://mlgwzuwflalosxhtbbhh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZ3d6dXdmbGFsb3N4aHRiYmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzc1NzEsImV4cCI6MjA4OTYxMzU3MX0.Zlmaea86lIiW_11XNhgpQHL5uyl456kLO3ekQmj7YH0';

// =====================================================
// 설정 확인
// =====================================================
if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('⚠️ Supabase 설정이 필요합니다!');
    console.error('js/config.js 파일에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정하세요.');
    console.error('설정 방법은 README.md를 참고하세요.');
}

// =====================================================
// 애플리케이션 설정
// =====================================================
const APP_CONFIG = {
    // 페이지당 표시할 입찰 건수
    ITEMS_PER_PAGE: 10,
    
    // 날짜 포맷
    DATE_FORMAT: 'YYYY-MM-DD',
    
    // 통화 포맷 (원화)
    CURRENCY_FORMAT: {
        style: 'currency',
        currency: 'KRW',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    },
    
    // 검색 디바운스 시간 (ms)
    SEARCH_DEBOUNCE: 500,
    
    // 나라장터 기본 URL
    G2B_BASE_URL: 'https://www.g2b.go.kr',
    
    // 데이터 새로고침 간격 (분)
    REFRESH_INTERVAL: 60
};

// =====================================================
// 내보내기
// =====================================================
// ES6 모듈 방식으로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        APP_CONFIG
    };
}
