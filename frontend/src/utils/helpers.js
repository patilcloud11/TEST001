// ── Currency formatting ───────────────────────────────────────────────────────
export const formatCurrency = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);

export const formatCompact = (amount) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
};

// ── Date formatting ───────────────────────────────────────────────────────────
export const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatDateShort = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const currentYearMonth = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    yearMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  };
};

// ── Category config ───────────────────────────────────────────────────────────
export const CATEGORY_CONFIG = {
  grocery:       { label: 'Grocery',       color: '#34d399', icon: '🛒' },
  food_dining:   { label: 'Food & Dining', color: '#f59e0b', icon: '🍽️' },
  transportation:{ label: 'Transport',     color: '#60a5fa', icon: '🚗' },
  utilities:     { label: 'Utilities',     color: '#a78bfa', icon: '⚡' },
  entertainment: { label: 'Entertainment', color: '#f472b6', icon: '🎬' },
  healthcare:    { label: 'Healthcare',    color: '#34d399', icon: '💊' },
  education:     { label: 'Education',     color: '#38bdf8', icon: '📚' },
  clothing:      { label: 'Clothing',      color: '#fb923c', icon: '👗' },
  personal_care: { label: 'Personal Care', color: '#e879f9', icon: '✨' },
  rent:          { label: 'Rent',          color: '#f87171', icon: '🏠' },
  other:         { label: 'Other',         color: '#94a3b8', icon: '📦' },
};

export const getCategoryConfig = (cat) =>
  CATEGORY_CONFIG[cat] || { label: cat, color: '#94a3b8', icon: '📦' };

// ── Investment type config ────────────────────────────────────────────────────
export const INVESTMENT_CONFIG = {
  sip:     { label: 'SIP / Mutual Fund', color: '#34d399', icon: '📈' },
  lic:     { label: 'LIC Policy',        color: '#60a5fa', icon: '🛡️' },
  fd:      { label: 'Fixed Deposit',     color: '#fbbf24', icon: '🏦' },
  ppf:     { label: 'PPF',              color: '#a78bfa', icon: '🏛️' },
  nps:     { label: 'NPS',              color: '#38bdf8', icon: '🎯' },
  stocks:  { label: 'Stocks',            color: '#f472b6', icon: '📊' },
  gold:    { label: 'Gold',             color: '#f59e0b', icon: '🥇' },
  savings: { label: 'Savings',           color: '#34d399', icon: '💰' },
  rd:      { label: 'Recurring Deposit', color: '#fb923c', icon: '🔄' },
  other:   { label: 'Other',            color: '#94a3b8', icon: '📦' },
};

export const getInvestmentConfig = (type) =>
  INVESTMENT_CONFIG[type] || { label: type, color: '#94a3b8', icon: '📦' };

// ── Health score color ────────────────────────────────────────────────────────
export const getHealthColor = (score) => {
  if (score >= 80) return '#34d399'; // green
  if (score >= 60) return '#fbbf24'; // amber
  if (score >= 40) return '#fb923c'; // orange
  return '#f87171'; // red
};

// ── Truncate text ─────────────────────────────────────────────────────────────
export const truncate = (str, n = 30) =>
  str?.length > n ? str.slice(0, n - 1) + '…' : str || '';

// ── Class merge helper ────────────────────────────────────────────────────────
export const cn = (...classes) => classes.filter(Boolean).join(' ');
