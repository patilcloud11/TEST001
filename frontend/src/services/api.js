import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Named service wrappers ────────────────────────────────────────────────────
export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  signup: (data) => api.post('/auth/signup', data),
  getProfile: () => api.get('/auth/profile'),
};

export const expenseService = {
  add: (data) => api.post('/expenses', data),
  getAll: (params) => api.get('/expenses', { params }),
  getSummary: (year, month) => api.get(`/expenses/summary/${year}/${month}`),
  getTrend: (months = 6) => api.get('/expenses/trend', { params: { months } }),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

export const billService = {
  add: (data) => api.post('/bills', data),
  getAll: (params) => api.get('/bills', { params }),
  markPaid: (id) => api.put(`/bills/${id}/pay`),
  delete: (id) => api.delete(`/bills/${id}`),
};

export const investmentService = {
  add: (data) => api.post('/investments', data),
  getAll: () => api.get('/investments'),
  update: (id, data) => api.put(`/investments/${id}`, data),
  delete: (id) => api.delete(`/investments/${id}`),
};

export const familyService = {
  get: () => api.get('/families'),
  update: (data) => api.put('/families', data),
  getDashboard: () => api.get('/families/dashboard'),
};

export const aiService = {
  getInsights: () => api.get('/ai/insights'),
  analyze: (question) => api.post('/ai/analyze', { question }),
  getBudgetRecommendations: (data) => api.post('/ai/budget-recommendations', data),
  getInvestmentSuggestions: (params) => api.get('/ai/investment-suggestions', { params }),
};

export const marketService = {
  getCommodities: () => api.get('/market/commodities'),
  getOverview: () => api.get('/market/overview'),
  getPredictions: (asset) => api.get('/market/predictions', { params: { asset } }),
};
