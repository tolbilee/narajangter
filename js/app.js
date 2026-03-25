let supabaseClient;
let currentPage = 1;
let totalCount = 0;
let selectedBid = null;
let currentDataWindowDays = 7;

const state = {
    keyword: '',
    startDate: '',
    endDate: '',
    sortBy: 'notice_date',
    sortOrder: 'desc',
};

function initSupabase() {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
    } catch (error) {
        console.error('Supabase 초기화 실패:', error);
        alert('Supabase 연결에 실패했습니다.');
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initSupabase()) return;

    initEventListeners();
    setDefaultDates(7);
    syncDateFilterState();
    await runRefresh(7, {
        silent: true,
        loadingMessage: '최초 접속 데이터를 불러오는 중입니다...',
    });
});

function initEventListeners() {
    document.getElementById('search-btn').addEventListener('click', onSearch);
    document.getElementById('reset-btn').addEventListener('click', onReset);
    document.getElementById('sort-select').addEventListener('change', onSortChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('keyword-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onSearch();
    });
    document.getElementById('keyword-search').addEventListener('input', async (e) => {
        state.keyword = e.target.value.trim();
        currentPage = 1;
        await loadBids();
    });
    document.getElementById('start-date').addEventListener('change', async () => {
        syncDateFilterState();
        currentPage = 1;
        await loadBids();
    });
    document.getElementById('end-date').addEventListener('change', async () => {
        syncDateFilterState();
        currentPage = 1;
        await loadBids();
    });
    document.getElementById('open-detail-btn').addEventListener('click', openSelectedBidUrl);

    document.querySelectorAll('.quick-dates .btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const days = Number(e.currentTarget.dataset.days || 7);
            await runRefresh(days, {
                silent: false,
                loadingMessage: `최근 ${days}일 데이터를 다시 구성하고 있습니다...`,
            });
        });
    });
}

async function runRefresh(days, options = {}) {
    const { silent = false, loadingMessage = '데이터를 동기화 중입니다...' } = options;
    showGlobalLoading(true, loadingMessage);

    try {
        const response = await fetch(FETCH_BIDS_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                days,
                resetAll: true,
            }),
        });

        const text = await response.text();
        const result = text ? JSON.parse(text) : {};
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        currentDataWindowDays = days;
        setDefaultDates(days);
        syncDateFilterState();
        await refreshDashboard();

        if (!silent) {
            alert(`갱신 완료\n${result.message}\n저장: ${result.insertedCount || 0}/${result.totalItems || 0}`);
        }
    } catch (error) {
        console.error('갱신 실패:', error);
        alert(`데이터 갱신 실패\n${error.message}`);
    } finally {
        showGlobalLoading(false);
    }
}

function setDefaultDates(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    document.getElementById('start-date').value = formatDate(start);
    document.getElementById('end-date').value = formatDate(end);
}

function syncDateFilterState() {
    state.startDate = document.getElementById('start-date').value;
    state.endDate = document.getElementById('end-date').value;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function refreshDashboard() {
    await loadBids();
    await updateStatistics();
    updateLastUpdateTime();
}

async function onSearch() {
    state.keyword = document.getElementById('keyword-search').value.trim();
    currentPage = 1;
    await loadBids();
}

async function onReset() {
    document.getElementById('keyword-search').value = '';
    document.getElementById('sort-select').value = 'notice_desc';
    state.keyword = '';
    state.sortBy = 'notice_date';
    state.sortOrder = 'desc';
    setDefaultDates(currentDataWindowDays);
    syncDateFilterState();
    currentPage = 1;
    await loadBids();
}

async function onSortChange(e) {
    const [sortBy, sortOrder] = String(e.target.value || 'notice_desc').split('_');
    state.sortBy = sortBy === 'notice' ? 'notice_date' : sortBy === 'bid' ? 'bid_date' : sortBy === 'amount' ? 'bid_amount' : 'notice_date';
    state.sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    currentPage = 1;
    await loadBids();
}

async function loadBids() {
    showLoading(true);
    hideEmptyState();

    try {
        let query = supabaseClient.from('bids').select('*', { count: 'exact' });

        if (state.keyword) {
            query = query.or(
                `bid_notice_name.ilike.%${state.keyword}%,` +
                `bid_notice_org.ilike.%${state.keyword}%,` +
                `demand_org.ilike.%${state.keyword}%`
            );
        }

        if (state.startDate) query = query.gte('notice_date', state.startDate);
        if (state.endDate) query = query.lte('notice_date', state.endDate);

        query = query.order(state.sortBy, { ascending: state.sortOrder === 'asc' });

        const from = (currentPage - 1) * APP_CONFIG.ITEMS_PER_PAGE;
        const to = from + APP_CONFIG.ITEMS_PER_PAGE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        totalCount = count || 0;
        renderRows(data || []);
        renderPagination();
        updateResultsCount(totalCount);

        if (!data || data.length === 0) showEmptyState();
    } catch (error) {
        console.error('목록 조회 실패:', error);
        alert('데이터를 불러오지 못했습니다.');
    } finally {
        showLoading(false);
    }
}

function renderRows(rows) {
    const tbody = document.getElementById('bids-list');
    tbody.innerHTML = '';

    for (const bid of rows) {
        const tr = document.createElement('tr');
        tr.dataset.id = bid.bid_notice_no;
        tr.onclick = () => selectBid(bid, tr);

        const statusLabel = formatStatusLabel(bid.bid_status);
        const statusClass = String(bid.bid_status || '').toUpperCase() === 'CLOSED' ? 'status-closed' : 'status-open';
        tr.innerHTML = `
            <td class="title-cell">${escapeHtml(bid.bid_notice_name || '-')}</td>
            <td><div>${escapeHtml(bid.bid_notice_org || '-')}</div><div class="muted">${escapeHtml(bid.demand_org || '-')}</div></td>
            <td>${formatDisplayDate(bid.notice_date)}</td>
            <td>${formatDisplayDateTime(bid.bid_date)}</td>
            <td>${formatCurrency(bid.bid_amount)}</td>
            <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        `;
        tbody.appendChild(tr);
    }
}

function selectBid(bid, rowEl) {
    selectedBid = bid;
    document.querySelectorAll('#bids-list tr').forEach((r) => r.classList.remove('is-selected'));
    rowEl.classList.add('is-selected');
    renderDetail(bid);
}

function renderDetail(bid) {
    const body = document.getElementById('detail-body');
    const openBtn = document.getElementById('open-detail-btn');
    const statusText = escapeHtml(formatStatusLabel(bid.bid_status));

    body.innerHTML = `
        <div class="detail-item"><strong>공고명</strong>${escapeHtml(bid.bid_notice_name || '-')}</div>
        <div class="detail-item"><strong>공고번호</strong>${escapeHtml(bid.bid_notice_no || '-')}</div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>공고기관</strong>${escapeHtml(bid.bid_notice_org || '-')}</div>
            <div class="detail-item"><strong>수요기관</strong>${escapeHtml(bid.demand_org || '-')}</div>
        </div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>공고일</strong>${formatDisplayDate(bid.notice_date)}</div>
            <div class="detail-item"><strong>입찰 마감</strong>${formatDisplayDateTime(bid.bid_date)}</div>
        </div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>계약방식</strong>${escapeHtml(bid.contract_type || '-')}</div>
            <div class="detail-item"><strong>상태</strong>${statusText}</div>
        </div>
        <div class="detail-item"><strong>추정금액</strong>${formatCurrency(bid.bid_amount)}</div>
        <div class="detail-item"><strong>설명</strong>${escapeHtml(bid.description || '-')}</div>
    `;
    openBtn.style.display = bid.detail_url ? 'inline-flex' : 'none';
}

function openSelectedBidUrl() {
    if (selectedBid?.detail_url) window.open(selectedBid.detail_url, '_blank');
}

function renderPagination() {
    const totalPages = Math.ceil(totalCount / APP_CONFIG.ITEMS_PER_PAGE);
    const pagination = document.getElementById('pagination');
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'flex';
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;

    const pageNumbers = document.getElementById('page-numbers');
    pageNumbers.innerHTML = '';
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) {
        const btn = document.createElement('button');
        btn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => changePage(i);
        pageNumbers.appendChild(btn);
    }
}

async function changePage(page) {
    const totalPages = Math.ceil(totalCount / APP_CONFIG.ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    await loadBids();
}

async function updateStatistics() {
    try {
        const { count: totalBids } = await supabaseClient.from('bids').select('*', { count: 'exact', head: true });
        document.getElementById('total-bids').textContent = `${formatNumber(totalBids || 0)}건`;
        document.getElementById('total-bids-label').textContent = `최근 ${currentDataWindowDays}일간 전체 공고`;
        updateResultsCount(totalCount);
    } catch (error) {
        console.error('통계 업데이트 실패:', error);
    }
}

function updateResultsCount(count) {
    const keyword = state.keyword || '(전체)';
    document.getElementById('results-keyword-label').textContent = `검색 키워드: ${keyword}`;
    document.getElementById('results-count').textContent = `${formatNumber(count)}건`;
}

function updateLastUpdateTime() {
    const now = new Date();
    const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('last-update').textContent = `마지막 갱신: ${value}`;
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showGlobalLoading(show, text = '데이터를 동기화 중입니다...') {
    const overlay = document.getElementById('global-loading');
    const label = document.getElementById('global-loading-text');
    if (!overlay || !label) return;
    label.textContent = text;
    overlay.style.display = show ? 'flex' : 'none';
}

function showEmptyState() {
    document.getElementById('empty-state').style.display = 'block';
}

function hideEmptyState() {
    document.getElementById('empty-state').style.display = 'none';
}

function formatStatusLabel(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'OPEN') return '진행중';
    if (normalized === 'CLOSED') return '마감';
    return status || '-';
}

function formatCurrency(amount) {
    if (!amount) return '-';
    return new Intl.NumberFormat('ko-KR', APP_CONFIG.CURRENCY_FORMAT).format(amount);
}

function formatNumber(value) {
    return new Intl.NumberFormat('ko-KR').format(value || 0);
}

function parseDateSafe(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;

    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length >= 12) {
        const y = Number(digits.slice(0, 4));
        const m = Number(digits.slice(4, 6)) - 1;
        const d = Number(digits.slice(6, 8));
        const hh = Number(digits.slice(8, 10));
        const mm = Number(digits.slice(10, 12));
        const dt = new Date(y, m, d, hh, mm, 0);
        if (!Number.isNaN(dt.getTime())) return dt;
    }
    if (digits.length >= 8) {
        const y = Number(digits.slice(0, 4));
        const m = Number(digits.slice(4, 6)) - 1;
        const d = Number(digits.slice(6, 8));
        const dt = new Date(y, m, d);
        if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
}

function formatDisplayDate(value) {
    const d = parseDateSafe(value);
    if (!d) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDateTime(value) {
    const d = parseDateSafe(value);
    if (!d) return '-';
    return `${formatDisplayDate(value)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(input) {
    if (input == null) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' };
    return String(input).replace(/[&<>"']/g, (m) => map[m]);
}
