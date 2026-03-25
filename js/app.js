// Main application script

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

function initSupabase() {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized');
        return true;
    } catch (error) {
        console.error('Supabase init failed:', error);
        showError('Supabase connection failed. Please check config.');
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initSupabase()) return;

    initEventListeners();
    setDefaultDates(30);
    currentFilters.startDate = document.getElementById('start-date').value;
    currentFilters.endDate = document.getElementById('end-date').value;

    await loadBids();
    await updateStatistics();
    updateLastUpdateTime();
});

function initEventListeners() {
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    document.getElementById('keyword-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    document.getElementById('apply-filter-btn').addEventListener('click', handleApplyFilter);
    document.getElementById('reset-btn').addEventListener('click', handleReset);

    document.querySelectorAll('.quick-dates .btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const days = parseInt(e.currentTarget.dataset.days, 10);
            setDefaultDates(days);
            currentFilters.startDate = document.getElementById('start-date').value;
            currentFilters.endDate = document.getElementById('end-date').value;
            currentPage = 1;
            await loadBids();
        });
    });

    document.getElementById('sort-select').addEventListener('change', handleSortChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('refresh-data-btn').addEventListener('click', handleRefreshData);
}

function setDefaultDates(days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    document.getElementById('start-date').value = formatDate(startDate);
    document.getElementById('end-date').value = formatDate(endDate);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function handleSearch() {
    currentFilters.keyword = document.getElementById('keyword-search').value.trim();
    currentPage = 1;
    await loadBids();
}

async function handleApplyFilter() {
    currentFilters.startDate = document.getElementById('start-date').value;
    currentFilters.endDate = document.getElementById('end-date').value;
    currentPage = 1;
    await loadBids();
}

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

async function handleSortChange(e) {
    const value = e.target.value;
    const [sortBy, sortOrder] = value.split('_');

    if (sortBy === 'notice') currentFilters.sortBy = 'notice_date';
    else if (sortBy === 'bid') currentFilters.sortBy = 'bid_date';
    else if (sortBy === 'amount') currentFilters.sortBy = 'bid_amount';
    else currentFilters.sortBy = 'notice_date';

    currentFilters.sortOrder = sortOrder === 'desc' ? 'desc' : 'asc';

    currentPage = 1;
    await loadBids();
}

async function handleRefreshData() {
    const btn = document.getElementById('refresh-data-btn');
    const icon = btn.querySelector('i');

    try {
        btn.disabled = true;
        icon.classList.add('fa-spin');

        const response = await fetch(FETCH_BIDS_FUNCTION_URL, {
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
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }

        alert(`Update done\n${result.message}\nSaved: ${result.insertedCount || 0}/${result.totalItems || 0}`);
        await loadBids();
        await updateStatistics();
        updateLastUpdateTime();
    } catch (error) {
        console.error('Refresh failed:', error);
        alert(`Data update failed.\n${error.message}`);
    } finally {
        btn.disabled = false;
        icon.classList.remove('fa-spin');
    }
}

async function loadBids() {
    showLoading(true);
    hideEmptyState();

    try {
        let query = supabaseClient
            .from('bids')
            .select('*', { count: 'exact' });

        if (currentFilters.keyword) {
            query = query.or(
                `bid_notice_name.ilike.%${currentFilters.keyword}%,` +
                `bid_notice_org.ilike.%${currentFilters.keyword}%,` +
                `demand_org.ilike.%${currentFilters.keyword}%`
            );
        }

        if (currentFilters.startDate) query = query.gte('notice_date', currentFilters.startDate);
        if (currentFilters.endDate) query = query.lte('notice_date', currentFilters.endDate);

        const ascending = currentFilters.sortOrder === 'asc';
        query = query.order(currentFilters.sortBy, { ascending });

        const from = (currentPage - 1) * APP_CONFIG.ITEMS_PER_PAGE;
        const to = from + APP_CONFIG.ITEMS_PER_PAGE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        totalCount = count || 0;
        if (data && data.length > 0) {
            displayBids(data);
            displayPagination();
            updateResultsCount(totalCount);
        } else {
            showEmptyState();
            updateResultsCount(0);
        }
    } catch (error) {
        console.error('Load failed:', error);
        showError('Failed to load data.');
    } finally {
        showLoading(false);
    }
}

function displayBids(bids) {
    const bidsList = document.getElementById('bids-list');
    bidsList.innerHTML = '';
    bids.forEach((bid) => bidsList.appendChild(createBidCard(bid)));
}

function createBidCard(bid) {
    const card = document.createElement('div');
    card.className = 'bid-card';
    card.onclick = () => showBidDetail(bid);

    const status = String(bid.bid_status || '').toUpperCase();
    const statusClass = status === 'CLOSED' ? 'closed' : 'active';
    const formattedAmount = formatCurrency(bid.bid_amount);
    const formattedNoticeDate = formatDisplayDate(bid.notice_date);
    const formattedBidDate = formatDisplayDateTime(bid.bid_date);

    card.innerHTML = `
        <div class="bid-header">
            <h3 class="bid-title">${escapeHtml(bid.bid_notice_name)}</h3>
            <span class="bid-status ${statusClass}">${escapeHtml(bid.bid_status || 'OPEN')}</span>
        </div>
        <div class="bid-meta">
            <div class="bid-meta-item">
                <i class="fas fa-building"></i>
                <span><strong>Notice Agency:</strong> ${escapeHtml(bid.bid_notice_org || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-users"></i>
                <span><strong>Demand Agency:</strong> ${escapeHtml(bid.demand_org || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-calendar"></i>
                <span><strong>Notice Date:</strong> ${formattedNoticeDate}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-clock"></i>
                <span><strong>Bid Deadline:</strong> ${formattedBidDate}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-file-contract"></i>
                <span><strong>Contract Type:</strong> ${escapeHtml(bid.contract_type || '-')}</span>
            </div>
            <div class="bid-meta-item">
                <i class="fas fa-won-sign"></i>
                <span><strong>Estimated Amount:</strong> <span class="bid-amount">${formattedAmount}</span></span>
            </div>
        </div>
    `;

    return card;
}

function showBidDetail(bid) {
    currentBidDetail = bid;
    const modal = document.getElementById('bid-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    modalTitle.textContent = bid.bid_notice_name || 'Bid Details';

    const formattedAmount = formatCurrency(bid.bid_amount);
    const formattedNoticeDate = formatDisplayDate(bid.notice_date);
    const formattedBidDate = formatDisplayDateTime(bid.bid_date);

    modalBody.innerHTML = `
        <div class="detail-row"><div class="detail-label">Notice No</div><div class="detail-value">${escapeHtml(bid.bid_notice_no)}</div></div>
        <div class="detail-row"><div class="detail-label">Notice Agency</div><div class="detail-value">${escapeHtml(bid.bid_notice_org || '-')}</div></div>
        <div class="detail-row"><div class="detail-label">Demand Agency</div><div class="detail-value">${escapeHtml(bid.demand_org || '-')}</div></div>
        <div class="detail-row"><div class="detail-label">Notice Date</div><div class="detail-value">${formattedNoticeDate}</div></div>
        <div class="detail-row"><div class="detail-label">Bid Deadline</div><div class="detail-value">${formattedBidDate}</div></div>
        <div class="detail-row"><div class="detail-label">Contract Type</div><div class="detail-value">${escapeHtml(bid.contract_type || '-')}</div></div>
        <div class="detail-row"><div class="detail-label">Estimated Amount</div><div class="detail-value" style="color: var(--primary-color); font-weight: 600;">${formattedAmount}</div></div>
        <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${escapeHtml(bid.bid_status || '-')}</div></div>
        ${bid.description ? `<div class="detail-row"><div class="detail-label">Description</div><div class="detail-value">${escapeHtml(bid.description)}</div></div>` : ''}
    `;

    modal.classList.add('active');
}

function closeBidModal() {
    document.getElementById('bid-modal').classList.remove('active');
    currentBidDetail = null;
}

function openBidDetail() {
    if (currentBidDetail && currentBidDetail.detail_url) {
        window.open(currentBidDetail.detail_url, '_blank');
    } else {
        alert('Detail URL is not available.');
    }
}

function displayPagination() {
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

    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);
    if (endPage - startPage < maxPages - 1) startPage = Math.max(1, endPage - maxPages + 1);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => changePage(i);
        pageNumbers.appendChild(pageBtn);
    }
}

async function changePage(page) {
    const totalPages = Math.ceil(totalCount / APP_CONFIG.ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    await loadBids();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function updateStatistics() {
    try {
        const { count: totalBids } = await supabaseClient.from('bids').select('*', { count: 'exact', head: true });
        const { count: activeBids } = await supabaseClient.from('bids').select('*', { count: 'exact', head: true }).neq('bid_status', 'CLOSED');
        const today = formatDate(new Date());
        const { count: todayBids } = await supabaseClient.from('bids').select('*', { count: 'exact', head: true }).eq('notice_date', today);

        document.getElementById('total-bids').textContent = formatNumber(totalBids || 0);
        document.getElementById('active-bids').textContent = formatNumber(activeBids || 0);
        document.getElementById('today-bids').textContent = formatNumber(todayBids || 0);
    } catch (error) {
        console.error('Stats update failed:', error);
    }
}

function updateResultsCount(count) {
    document.getElementById('results-count').textContent = `Results: ${formatNumber(count)}`;
}

function updateLastUpdateTime() {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('last-update').innerHTML = `<i class="fas fa-sync-alt"></i> Last update: ${formatted}`;
}

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
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

window.onclick = function(event) {
    const modal = document.getElementById('bid-modal');
    if (event.target === modal) closeBidModal();
};
