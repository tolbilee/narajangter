// =====================================================
// 나라장터 입찰 정보 시스템 - 메인 애플리케이션
// =====================================================

// === Supabase 클라이언트 초기화 ===
let supabaseClient;
let currentPage = 1;
let totalCount = 0;
let currentFilters = {
    keyword: '',
    startDate: '',
    endDate: '',
    sortBy: 'notice_date',
    sortOrder: 'desc'
};
let currentBidDetail = null;

// === 초기화 함수 ===
function initSupabase() {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase 클라이언트 초기화 성공');
        return true;
    } catch (error) {
        console.error('❌ Supabase 초기화 실패:', error);
        showError('Supabase 연결에 실패했습니다. 설정을 확인해주세요.');
        return false;
    }
}

// === 페이지 로드 시 실행 ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 애플리케이션 시작');
    
    // Supabase 초기화
    if (!initSupabase()) {
        return;
    }
    
    // 이벤트 리스너 등록
    initEventListeners();
    
    // 기본 날짜 설정 (최근 30일)
    setDefaultDates(30);
    
    // 초기 데이터 로드
    await loadBids();
    
    // 통계 업데이트
    await updateStatistics();
    
    // 마지막 업데이트 시간 표시
    updateLastUpdateTime();
});

// === 이벤트 리스너 초기화 ===
function initEventListeners() {
    // 검색 버튼
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    
    // 엔터 키로 검색
    document.getElementById('keyword-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 필터 적용 버튼
    document.getElementById('apply-filter-btn').addEventListener('click', handleApplyFilter);
    
    // 초기화 버튼
    document.getElementById('reset-btn').addEventListener('click', handleReset);
    
    // 빠른 날짜 선택 버튼
    document.querySelectorAll('.quick-dates .btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = parseInt(e.target.dataset.days);
            setDefaultDates(days);
        });
    });
    
    // 정렬 선택
    document.getElementById('sort-select').addEventListener('change', handleSortChange);
    
    // 페이지네이션
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    
    // 데이터 업데이트 버튼
    document.getElementById('refresh-data-btn').addEventListener('click', handleRefreshData);
}

// === 기본 날짜 설정 ===
function setDefaultDates(days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    document.getElementById('start-date').value = formatDate(startDate);
    document.getElementById('end-date').value = formatDate(endDate);
}

// === 날짜 포맷 함수 ===
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// === 검색 핸들러 ===
async function handleSearch() {
    currentFilters.keyword = document.getElementById('keyword-search').value.trim();
    currentPage = 1;
    await loadBids();
}

// === 필터 적용 핸들러 ===
async function handleApplyFilter() {
    currentFilters.startDate = document.getElementById('start-date').value;
    currentFilters.endDate = document.getElementById('end-date').value;
    currentPage = 1;
    await loadBids();
}

// === 초기화 핸들러 ===
async function handleReset() {
    document.getElementById('keyword-search').value = '';
    setDefaultDates(30);
    currentFilters = {
        keyword: '',
        startDate: document.getElementById('start-date').value,
        endDate: document.getElementById('end-date').value,
        sortBy: 'notice_date',
        sortOrder: 'desc'
    };
    document.getElementById('sort-select').value = 'notice_desc';
    currentPage = 1;
    await loadBids();
}

// === 정렬 변경 핸들러 ===
async function handleSortChange(e) {
    const value = e.target.value;
    const [sortBy, sortOrder] = value.split('_');
    
    // sortBy 매핑
    if (sortBy === 'notice') {
        currentFilters.sortBy = 'notice_date';
    } else if (sortBy === 'bid') {
        currentFilters.sortBy = 'bid_date';
    } else if (sortBy === 'amount') {
        currentFilters.sortBy = 'bid_amount';
    } else {
        currentFilters.sortBy = 'notice_date'; // 기본값
    }
    
    currentFilters.sortOrder = sortOrder === 'desc' ? 'desc' : 'asc';
    
    currentPage = 1;
    await loadBids();
}

// === 나라장터 API 데이터 업데이트 핸들러 ===
async function handleRefreshData() {
    const btn = document.getElementById('refresh-data-btn');
    const icon = btn.querySelector('i');
    
    try {
        console.log('🔄 나라장터 API 데이터 업데이트 시작...');
        
        // 버튼 비활성화 및 로딩 상태
        btn.disabled = true;
        icon.classList.add('fa-spin');
        
        // Edge Function 호출 (실제 배포된 함수 경로 사용)
        const response = await fetch('https://mlgwzuwflalosxhtbbhh.supabase.co/functions/v1/bright-function', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ API 응답:', result);
        
        if (result.success) {
            alert(`✅ ${result.message}\n총 ${result.totalItems || 0}건 중 ${result.insertedCount || 0}건 저장 완료`);
            
            // 데이터 새로고침
            await loadBids();
            await updateStatistics();
            updateLastUpdateTime();
        } else {
            throw new Error(result.error || '알 수 없는 오류');
        }
        
    } catch (error) {
        console.error('❌ 데이터 업데이트 실패:', error);
        alert(`❌ 데이터 업데이트에 실패했습니다.\n${error.message}`);
    } finally {
        // 버튼 복구
        btn.disabled = false;
        icon.classList.remove('fa-spin');
    }
}

// === 입찰 정보 로드 ===
async function loadBids() {
    showLoading(true);
    hideEmptyState();
    
    try {
        // 쿼리 시작
        let query = supabaseClient
            .from('bids')
            .select('*', { count: 'exact' });
        
        // 키워드 검색
        if (currentFilters.keyword) {
            query = query.or(
                `bid_notice_name.ilike.%${currentFilters.keyword}%,` +
                `bid_notice_org.ilike.%${currentFilters.keyword}%,` +
                `demand_org.ilike.%${currentFilters.keyword}%`
            );
        }
        
        // 날짜 필터
        if (currentFilters.startDate) {
            query = query.gte('notice_date', currentFilters.startDate);
        }
        if (currentFilters.endDate) {
            query = query.lte('notice_date', currentFilters.endDate);
        }
        
        // 정렬
        const ascending = currentFilters.sortOrder === 'asc';
        query = query.order(currentFilters.sortBy, { ascending });
        
        // 페이지네이션
        const from = (currentPage - 1) * APP_CONFIG.ITEMS_PER_PAGE;
        const to = from + APP_CONFIG.ITEMS_PER_PAGE - 1;
        query = query.range(from, to);
        
        // 실행
        const { data, error, count } = await query;
        
        if (error) throw error;
        
        totalCount = count || 0;
        
        // 결과 표시
        if (data && data.length > 0) {
            displayBids(data);
            displayPagination();
            updateResultsCount(totalCount);
        } else {
            showEmptyState();
            updateResultsCount(0);
        }
        
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        showError('데이터를 불러오는데 실패했습니다.');
    } finally {
        showLoading(false);
    }
}

// === 입찰 정보 표시 ===
function displayBids(bids) {
    const bidsList = document.getElementById('bids-list');
    bidsList.innerHTML = '';
    
    bids.forEach(bid => {
        const bidCard = createBidCard(bid);
        bidsList.appendChild(bidCard);
    });
}

// === 입찰 카드 생성 ===
function createBidCard(bid) {
    const card = document.createElement('div');
    card.className = 'bid-card';
    card.onclick = () => showBidDetail(bid);
    
    const statusClass = bid.bid_status === '공고중' ? 'active' : 'closed';
    const formattedAmount = formatCurrency(bid.bid_amount);
    const formattedNoticeDate = formatDisplayDate(bid.notice_date);
    const formattedBidDate = formatDisplayDateTime(bid.bid_date);
    
    card.innerHTML = `
        <div class="bid-header">
            <h3 class="bid-title">${escapeHtml(bid.bid_notice_name)}</h3>
            <span class="bid-status ${statusClass}">${escapeHtml(bid.bid_status || '상태미정')}</span>
        </div>
        <div class="bid-meta">
            <div class="bid-meta-item">
                <i class="fas fa-building"></i>
                <span><strong>공고기관:</strong> ${escapeHtml(bid.bid_notice_org || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-users"></i>
                <span><strong>수요기관:</strong> ${escapeHtml(bid.demand_org || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-calendar"></i>
                <span><strong>공고일:</strong> ${formattedNoticeDate}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-clock"></i>
                <span><strong>입찰일시:</strong> ${formattedBidDate}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-file-contract"></i>
                <span><strong>계약방법:</strong> ${escapeHtml(bid.contract_type || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-won-sign"></i>
                <span><strong>예정가격:</strong> <span class="bid-amount">${formattedAmount}</span></span>
            </div>
        </div>
    `;
    
    return card;
}

// === 입찰 상세 정보 모달 ===
function showBidDetail(bid) {
    currentBidDetail = bid;
    const modal = document.getElementById('bid-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    
    modalTitle.textContent = bid.bid_notice_name;
    
    const formattedAmount = formatCurrency(bid.bid_amount);
    const formattedNoticeDate = formatDisplayDate(bid.notice_date);
    const formattedBidDate = formatDisplayDateTime(bid.bid_date);
    
    modalBody.innerHTML = `
        <div class="detail-row">
            <div class="detail-label">입찰공고번호</div>
            <div class="detail-value">${escapeHtml(bid.bid_notice_no)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">공고기관</div>
            <div class="detail-value">${escapeHtml(bid.bid_notice_org || '-')}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">수요기관</div>
            <div class="detail-value">${escapeHtml(bid.demand_org || '-')}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">공고일</div>
            <div class="detail-value">${formattedNoticeDate}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">입찰일시</div>
            <div class="detail-value">${formattedBidDate}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">계약방법</div>
            <div class="detail-value">${escapeHtml(bid.contract_type || '-')}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">예정가격</div>
            <div class="detail-value" style="color: var(--primary-color); font-weight: 600;">${formattedAmount}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">진행상태</div>
            <div class="detail-value">${escapeHtml(bid.bid_status || '-')}</div>
        </div>
        ${bid.description ? `
        <div class="detail-row">
            <div class="detail-label">상세설명</div>
            <div class="detail-value">${escapeHtml(bid.description)}</div>
        </div>
        ` : ''}
    `;
    
    modal.classList.add('active');
}

// === 모달 닫기 ===
function closeBidModal() {
    const modal = document.getElementById('bid-modal');
    modal.classList.remove('active');
    currentBidDetail = null;
}

// === 나라장터 상세페이지 열기 ===
function openBidDetail() {
    if (currentBidDetail && currentBidDetail.detail_url) {
        window.open(currentBidDetail.detail_url, '_blank');
    } else {
        alert('상세 페이지 URL이 없습니다.');
    }
}

// === 페이지네이션 표시 ===
function displayPagination() {
    const totalPages = Math.ceil(totalCount / APP_CONFIG.ITEMS_PER_PAGE);
    
    if (totalPages <= 1) {
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    document.getElementById('pagination').style.display = 'flex';
    
    // 이전/다음 버튼 활성화 상태
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;
    
    // 페이지 번호 표시
    const pageNumbers = document.getElementById('page-numbers');
    pageNumbers.innerHTML = '';
    
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);
    
    if (endPage - startPage < maxPages - 1) {
        startPage = Math.max(1, endPage - maxPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => changePage(i);
        pageNumbers.appendChild(pageBtn);
    }
}

// === 페이지 변경 ===
async function changePage(page) {
    const totalPages = Math.ceil(totalCount / APP_CONFIG.ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    await loadBids();
    
    // 페이지 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === 통계 업데이트 ===
async function updateStatistics() {
    try {
        // 전체 공고 수
        const { count: totalBids } = await supabaseClient
            .from('bids')
            .select('*', { count: 'exact', head: true });
        
        // 진행중인 공고 수
        const { count: activeBids } = await supabaseClient
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('bid_status', '공고중');
        
        // 오늘 등록된 공고 수
        const today = formatDate(new Date());
        const { count: todayBids } = await supabaseClient
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('notice_date', today);
        
        document.getElementById('total-bids').textContent = formatNumber(totalBids || 0);
        document.getElementById('active-bids').textContent = formatNumber(activeBids || 0);
        document.getElementById('today-bids').textContent = formatNumber(todayBids || 0);
        
    } catch (error) {
        console.error('통계 업데이트 실패:', error);
    }
}

// === 검색 결과 수 업데이트 ===
function updateResultsCount(count) {
    document.getElementById('results-count').textContent = `검색 결과: ${formatNumber(count)}건`;
}

// === 마지막 업데이트 시간 ===
function updateLastUpdateTime() {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('last-update').innerHTML = `<i class="fas fa-sync-alt"></i> 마지막 업데이트: ${formatted}`;
}

// === UI 헬퍼 함수 ===
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showEmptyState() {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('bids-list').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
}

function hideEmptyState() {
    document.getElementById('empty-state').style.display = 'none';
}

function showError(message) {
    alert(message);
}

// === 포맷 함수 ===
function formatCurrency(amount) {
    if (!amount) return '-';
    return new Intl.NumberFormat('ko-KR', APP_CONFIG.CURRENCY_FORMAT).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatDisplayDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDateTime(dateTimeString) {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// === 모달 외부 클릭 시 닫기 ===
window.onclick = function(event) {
    const modal = document.getElementById('bid-modal');
    if (event.target === modal) {
        closeBidModal();
    }
};

console.log('✅ 애플리케이션 스크립트 로드 완료');
