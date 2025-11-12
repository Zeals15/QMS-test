// src/api.ts
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path: string, opts: RequestInit = {}) {
  const url = `${BASE}${path}`;
  // Inject Authorization header automatically when a token is present in localStorage
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  } as Record<string,string>;
  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
    try { console.debug('[api] attaching Authorization header to', url, 'token?', token ? (token.slice(0,6) + '...') : false); } catch(e){}
  }
  try {
    console.debug('[api] request', opts.method || 'GET', url);
    console.debug('[api] request headers', headers);
  } catch (e) {}
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[api] request failed ${res.status} ${url}:`, txt);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

export const api = {
  getStats: () => request('/api/stats'),
  getQuotations: () => request('/api/quotations'),
  getRecentQuotations: () => request('/api/quotations/recent'),
  getCustomers: () => request('/api/customers'),
  addCustomer: (payload: any) => request('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),
  getProducts: () => request('/api/products'),
  addProduct: (payload: any) => request('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id:number, payload:any) => request(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id:number) => request(`/api/products/${id}`, { method: 'DELETE' }),
  createQuotation: (payload: any) => request('/api/quotations', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: any) => request('/api/login', { method: 'POST', body: JSON.stringify(payload) })
};
