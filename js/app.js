let supabaseClient;
let currentPage = 1;
let totalCount = 0;
let selectedBid = null;
let currentDataWindowDays = 7;
let loadingTicker = null;
let loadingStartAt = 0;
let loadingExpectedMs = 0;
let latestLoadRequestId = 0;

const state = {
    keyword: '',
    startDate: '',
    endDate: '',
    sortBy: 'bid_date',
    sortOrder: 'asc',
};

function initTitleRocketIcon() {
    const el = document.getElementById('title-rocket');
    if (!el) return;
    if (!window.lottie) {
        el.textContent = '🚀';
        return;
    }
    window.lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'rocket_15557778.json',
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
        },
    });
}

function initLoadingRocketIcon() {
    const el = document.getElementById('loading-rocket');
    if (!el) return;
    if (!window.lottie) {
        el.textContent = '\uD83D\uDE80';
        return;
    }
    window.lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'rocket_15557778.json',
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
        },
    });
}

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

    initTitleRocketIcon();
    initLoadingRocketIcon();
    initEventListeners();
    setDefaultDates(7);
    syncDateFilterState();
    await refreshDashboard();
    runRefresh(7, {
        silent: true,
        loadingMessage: '최초 접속 데이터를 불러오는 중입니다...',
    });
});

function initEventListeners() {
    const legacySearchBtn = document.getElementById('search-btn');
    if (legacySearchBtn) {
        legacySearchBtn.remove();
    }

    document.getElementById('reset-btn').addEventListener('click', onReset);
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.querySelectorAll('th.sortable[data-sort]').forEach((th) => {
        th.addEventListener('click', async () => {
            await onHeaderSort(th.dataset.sort);
        });
    });
    const keywordInput = document.getElementById('keyword-search');
    keywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onSearch();
    });
    keywordInput.addEventListener('input', async (e) => {
        state.keyword = e.target.value.trim();
        currentPage = 1;
        await loadBids();
    });
    keywordInput.addEventListener('click', async () => {
        if (!keywordInput.value.trim()) return;
        keywordInput.value = '';
        state.keyword = '';
        currentPage = 1;
        await loadBids();
    });
    document.querySelectorAll('.kw-chip[data-keyword]').forEach((chip) => {
        chip.addEventListener('click', async (e) => {
            const keyword = String(e.currentTarget.dataset.keyword || '').trim();
            const input = document.getElementById('keyword-search');
            if (!input || !keyword) return;
            input.value = keyword;
            state.keyword = keyword;
            currentPage = 1;
            await loadBids();
        });
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

    updateQuickDateButtons();
    updateSortHeaderUI();
}

async function runRefresh(days, options = {}) {
    const { silent = false, loadingMessage = '데이터를 동기화 중입니다...' } = options;
    loadingStartAt = Date.now();
    loadingExpectedMs = getExpectedDurationMs(days);
    if (!silent) {
        showGlobalLoading(true, loadingMessage, loadingExpectedMs);
    }

    try {
        const response = await fetch(FETCH_BIDS_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                days,
                resetAll: false,
            }),
        });

        const text = await response.text();
        const result = text ? JSON.parse(text) : {};
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        currentDataWindowDays = days;
        updateQuickDateButtons();
        setDefaultDates(days);
        syncDateFilterState();
        await refreshDashboard();
        saveActualDuration(days, Date.now() - loadingStartAt);

        // 성공 팝업은 UX 간소화를 위해 표시하지 않는다.
    } catch (error) {
        console.error('갱신 실패:', error);
        alert(`데이터 갱신 실패\n${error.message}`);
    } finally {
        if (!silent) {
            showGlobalLoading(false);
        }
    }
}

function setDefaultDates(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    document.getElementById('start-date').value = formatDate(start);
    document.getElementById('end-date').value = formatDate(end);
}

function updateQuickDateButtons() {
    document.querySelectorAll('.quick-dates .btn[data-days]').forEach((btn) => {
        const days = Number(btn.dataset.days || 0);
        const active = days === currentDataWindowDays;
        btn.classList.toggle('btn-primary', active);
        btn.classList.toggle('btn-secondary', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
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
    state.keyword = '';
    state.sortBy = 'bid_date';
    state.sortOrder = 'asc';
    updateSortHeaderUI();
    setDefaultDates(currentDataWindowDays);
    syncDateFilterState();
    currentPage = 1;
    await loadBids();
}

async function onHeaderSort(sortBy) {
    if (!sortBy) return;
    if (state.sortBy === sortBy) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortBy = sortBy;
        state.sortOrder = sortBy === 'bid_date' ? 'asc' : 'desc';
    }

    updateSortHeaderUI();
    currentPage = 1;
    await loadBids();
}

function updateSortHeaderUI() {
    document.querySelectorAll('th.sortable[data-sort]').forEach((th) => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.sort === state.sortBy) {
            th.classList.add(state.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

async function loadBids() {
    const requestId = ++latestLoadRequestId;
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

        const from = (currentPage - 1) * APP_CONFIG.ITEMS_PER_PAGE;
        const to = from + APP_CONFIG.ITEMS_PER_PAGE - 1;
        let data;
        let count;
        let error;

        if (state.sortBy === 'bid_date') {
            const result = await query;
            data = result.data;
            count = result.count;
            error = result.error;
            if (!error && Array.isArray(data)) {
                const sorted = sortRowsByBidDateSmart(data, state.sortOrder);
                data = sorted.slice(from, to + 1);
                count = sorted.length;
            }
        } else {
            query = query.order(state.sortBy, { ascending: state.sortOrder === 'asc' });
            query = query.range(from, to);
            const result = await query;
            data = result.data;
            count = result.count;
            error = result.error;
        }

        if (error) throw error;
        if (requestId !== latestLoadRequestId) return;

        totalCount = count || 0;
        renderRows(data || []);
        renderPagination();
        updateResultsCount(totalCount);

        if (!data || data.length === 0) {
            showEmptyState();
        } else {
            hideEmptyState();
        }
    } catch (error) {
        console.error('목록 조회 실패:', error);
        alert('데이터를 불러오지 못했습니다.');
    } finally {
        if (requestId === latestLoadRequestId) {
            showLoading(false);
        }
    }
}

function renderRows(rows) {
    const tbody = document.getElementById('bids-list');
    tbody.innerHTML = '';

    for (const bid of rows) {
        const tr = document.createElement('tr');
        tr.dataset.id = bid.bid_notice_no;
        tr.onclick = () => selectBid(bid, tr);
        if (isPastDeadline(bid.bid_date)) {
            tr.classList.add('is-expired');
        }

        const statusBadge = getStatusBadgeMeta(bid);
        tr.innerHTML = `
            <td class="title-cell">${highlightKeyword(bid.bid_notice_name || '-', state.keyword)}</td>
            <td><div>${highlightKeyword(bid.bid_notice_org || '-', state.keyword)}</div><div class="muted">${escapeHtml(bid.demand_org || '-')}</div></td>
            <td>${formatDisplayDate(bid.notice_date)}</td>
            <td>${renderBidDeadlineHtml(bid.bid_date)}</td>
            <td class="amount-cell">${formatCurrency(bid.bid_amount)}</td>
            <td><span class="status-pill ${statusBadge.className}">${statusBadge.text}</span></td>
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
    const statusText = escapeHtml(isPastDeadline(bid.bid_date) ? '마감' : formatStatusLabel(bid.bid_status));
    const bidDeadlineHtml = renderBidDeadlineHtml(bid.bid_date);

    body.innerHTML = `
        <div class="detail-item"><strong>공고명</strong>${escapeHtml(bid.bid_notice_name || '-')}</div>
        <div class="detail-item"><strong>공고번호</strong>${escapeHtml(bid.bid_notice_no || '-')}</div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>공고기관</strong>${escapeHtml(bid.bid_notice_org || '-')}</div>
            <div class="detail-item"><strong>수요기관</strong>${escapeHtml(bid.demand_org || '-')}</div>
        </div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>공고일</strong>${formatDisplayDate(bid.notice_date)}</div>
            <div class="detail-item"><strong>입찰 마감</strong>${bidDeadlineHtml}</div>
        </div>
        <div class="detail-grid-two">
            <div class="detail-item"><strong>계약방식</strong>${escapeHtml(bid.contract_type || '-')}</div>
            <div class="detail-item"><strong>상태</strong>${statusText}</div>
        </div>
        <div class="detail-item detail-amount"><strong>추정금액</strong>${formatCurrency(bid.bid_amount)}</div>
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
        let query = supabaseClient.from('bids').select('*', { count: 'exact', head: true });
        if (state.startDate) query = query.gte('notice_date', state.startDate);
        if (state.endDate) query = query.lte('notice_date', state.endDate);
        const { count: totalBids } = await query;
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

function showGlobalLoading(show, text = '데이터를 동기화 중입니다...', expectedMs = 0) {
    const overlay = document.getElementById('global-loading');
    const label = document.getElementById('global-loading-text');
    const eta = document.getElementById('global-loading-eta');
    if (!overlay || !label) return;
    label.textContent = text;
    overlay.style.display = show ? 'flex' : 'none';

    if (!show) {
        if (loadingTicker) {
            clearInterval(loadingTicker);
            loadingTicker = null;
        }
        return;
    }

    const expected = Math.max(1000, expectedMs || 1000);
    const renderEta = () => {
        if (!eta) return;
        const elapsed = Date.now() - loadingStartAt;
        const remainMs = Math.max(expected - elapsed, 0);
        const elapsedSec = Math.floor(elapsed / 1000);
        const remainSec = Math.ceil(remainMs / 1000);
        if (remainMs > 0) {
            eta.textContent = `예상 남은 시간 약 ${remainSec}초 (경과 ${elapsedSec}초)`;
        } else {
            eta.textContent = `예상 시간 이후에도 동기화 중... (경과 ${elapsedSec}초)`;
        }
    };

    renderEta();
    if (loadingTicker) clearInterval(loadingTicker);
    loadingTicker = setInterval(renderEta, 1000);
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

function getStatusBadgeMeta(bid) {
    const normalized = String(bid?.bid_status || '').toUpperCase();
    if (isPastDeadline(bid?.bid_date) || normalized === 'CLOSED') {
        return {
            className: 'status-expired',
            text: '<i class="fas fa-hourglass-end"></i> 마감'
        };
    }
    return {
        className: 'status-open',
        text: '진행중'
    };
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

function sortRowsByBidDateSmart(rows, sortOrder = 'asc') {
    const now = Date.now();
    const toRank = (value) => {
        const d = parseDateSafe(value);
        if (!d) return { bucket: 2, time: Number.POSITIVE_INFINITY };
        const time = d.getTime();
        if (time >= now) return { bucket: 0, time };
        return { bucket: 1, time };
    };

    const copied = [...rows];
    copied.sort((a, b) => {
        const ar = toRank(a.bid_date);
        const br = toRank(b.bid_date);

        if (ar.bucket !== br.bucket) return ar.bucket - br.bucket;
        if (ar.bucket === 2) return 0;

        if (sortOrder === 'desc') {
            if (ar.bucket === 0) return br.time - ar.time;
            return ar.time - br.time;
        }

        if (ar.bucket === 0) return ar.time - br.time;
        return br.time - ar.time;
    });

    return copied;
}

function isUrgentDeadline(value) {
    const d = parseDateSafe(value);
    if (!d) return false;
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return false;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
}

function isPastDeadline(value) {
    const d = parseDateSafe(value);
    if (!d) return false;
    return d.getTime() < Date.now();
}

function renderBidDeadlineHtml(value) {
    const text = escapeHtml(formatDisplayDateTime(value));
    if (!isUrgentDeadline(value)) return text;
    return `${text}<span class="urgent-badge" title="마감 임박">긴급</span>`;
}

function escapeHtml(input) {
    if (input == null) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' };
    return String(input).replace(/[&<>"']/g, (m) => map[m]);
}

function highlightKeyword(text, keyword) {
    const raw = String(text ?? '');
    const q = String(keyword ?? '').trim();
    if (!q) return escapeHtml(raw);

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    let result = '';
    let cursor = 0;
    let matched = false;

    raw.replace(regex, (match, offset) => {
        matched = true;
        result += escapeHtml(raw.slice(cursor, offset));
        result += `<mark class="hl">${escapeHtml(match)}</mark>`;
        cursor = offset + match.length;
        return match;
    });

    if (!matched) return escapeHtml(raw);
    result += escapeHtml(raw.slice(cursor));
    return result;
}

function getExpectedDurationMs(days) {
    const key = `sync_duration_ms_${days}`;
    const saved = Number(localStorage.getItem(key) || 0);
    if (saved > 0) return saved;
    return days === 30 ? 45000 : 15000;
}

function saveActualDuration(days, actualMs) {
    if (!actualMs || actualMs < 500) return;
    const key = `sync_duration_ms_${days}`;
    const prev = Number(localStorage.getItem(key) || 0);
    const next = prev > 0 ? Math.round(prev * 0.7 + actualMs * 0.3) : Math.round(actualMs);
    localStorage.setItem(key, String(next));
}
