// src/api.ts
export const API_URL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const BASE = API_URL;

function buildHeaders(customHeaders?: Record<string,string>) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string,string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {})
  };
  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
    try { console.debug('[api] attaching Authorization header to request (token present)'); } catch(e) {}
  }
  return headers;
}

/**
 * requestJson - fetch and parse JSON/text safely (handles 204 No Content)
 */
async function requestJson(path: string, opts: RequestInit = {}) {
  const url = `${BASE}${path}`;
  const headers = buildHeaders(opts.headers as any);
  try { console.debug('[api] request', opts.method || 'GET', url); } catch(e){}

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[api] request failed ${res.status} ${url}:`, txt);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  // if not json, return text as fallback
  return res.text();
}

/**
 * requestBlob - fetch binary (eg. application/pdf)
 */
async function requestBlob(path: string, opts: RequestInit = {}) {
  const url = `${BASE}${path}`;
  const headers = buildHeaders(opts.headers as any);
  try { console.debug('[api] request (blob)', opts.method || 'GET', url); } catch(e){}

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[api] blob request failed ${res.status} ${url}:`, txt);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.blob();
}

export const api = {
  getStats: () => requestJson('/api/stats'),
  getQuotations: () => requestJson('/api/quotations'),
  getRecentQuotations: () => requestJson('/api/quotations/recent'),
  getCustomers: () => requestJson('/api/customers'),
  addCustomer: (payload: any) => requestJson('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),
  getProducts: () => requestJson('/api/products'),
  addProduct: (payload: any) => requestJson('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id: number, payload: any) => requestJson(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id: number) => requestJson(`/api/products/${id}`, { method: 'DELETE' }),

  // Quotations
  createQuotation: (payload: any) => requestJson('/api/quotations', { method: 'POST', body: JSON.stringify(payload) }),
  // new: delete a quotation
  deleteQuotation: (id: number) => requestJson(`/api/quotations/${id}`, { method: 'DELETE' }),
  // new: download pdf blob for a quotation (returns a Blob)
  getQuotationPdf: (id: number) => requestBlob(`/api/quotations/${id}/pdf`),

  // Auth
  login: (payload: any) => requestJson('/api/login', { method: 'POST', body: JSON.stringify(payload) })
};
