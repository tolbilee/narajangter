// Supabase client configuration

const SUPABASE_URL = 'https://mlgwzuwflalosxhtbbhh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZ3d6dXdmbGFsb3N4aHRiYmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzc1NzEsImV4cCI6MjA4OTYxMzU3MX0.Zlmaea86lIiW_11XNhgpQHL5uyl456kLO3ekQmj7YH0';

// Update this value if the deployed function name changes.
const FETCH_BIDS_FUNCTION_URL = 'https://mlgwzuwflalosxhtbbhh.supabase.co/functions/v1/bright-function';

const APP_CONFIG = {
    ITEMS_PER_PAGE: 10,
    DATE_FORMAT: 'YYYY-MM-DD',
    CURRENCY_FORMAT: {
        style: 'currency',
        currency: 'KRW',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    },
    SEARCH_DEBOUNCE: 500,
    G2B_BASE_URL: 'https://www.g2b.go.kr',
    REFRESH_INTERVAL: 60
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        FETCH_BIDS_FUNCTION_URL,
        APP_CONFIG
    };
}
