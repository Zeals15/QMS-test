// src/pages/Quotations.tsx
import React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';

type QuotationItem = {
  product_name?: string;
  product?: { name?: string };
  name?: string;
  product_title?: string;
};

type Q = {
  id: number;
  quotation_no: string;
  customer_name: string;
  total_value: string | number;
  status: string;
  created_at: string;
  items?: QuotationItem[];
  product_summary?: string;
  salesperson?: string | { name?: string } | null;
  sales_person?: string | { name?: string } | null;
  meta?: Record<string, any>;
};

const styles = {
  pagePadding: { padding: '24px 32px' } as React.CSSProperties,
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  newBtn: { background: '#ff6b61', color: '#fff', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' } as React.CSSProperties,
  panel: { background: '#fff', padding: 16, borderRadius: 8 } as React.CSSProperties,
  controls: { display: 'flex', gap: 8, marginBottom: 16 } as React.CSSProperties,
  search: { flex: 1, padding: 8 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, tableLayout: 'fixed' as const } as React.CSSProperties,
  thRow: { textAlign: 'left', borderBottom: '1px solid #eee' } as React.CSSProperties,
  th: { padding: 12, fontWeight: 600, fontSize: 14, color: '#374151' } as React.CSSProperties,
  td: { padding: 12, verticalAlign: 'middle' } as React.CSSProperties,
  statusPill: { padding: '4px 10px', borderRadius: 999, background: '#eef2ff', fontSize: 13, display: 'inline-block' } as React.CSSProperties,
  actionsCell: { padding: 12, verticalAlign: 'middle', textAlign: 'right' } as React.CSSProperties,
  actionGroup: { display: 'inline-flex', gap: 8, alignItems: 'center' } as React.CSSProperties,
  linkBtn: { background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  editBtn: { ...({} as any), background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  deleteBtn: { color: '#c0392b', background: 'transparent', border: 'none', padding: '6px 8px', cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  amount: { whiteSpace: 'nowrap' } as React.CSSProperties,
  emptyRow: { padding: 24, textAlign: 'center' } as React.CSSProperties,
};

export default function Quotations() {
  const [rows, setRows] = useState<Q[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getQuotations();
      setRows(data || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }

  // product extractor tries common shapes
  function productListText(row: Q) {
    const names: string[] = [];

    if (Array.isArray(row.items) && row.items.length) {
      row.items.forEach((it: any) => {
        if (!it) return;

        if (typeof it.product_name === 'string' && it.product_name.trim()) {
          names.push(it.product_name.trim());
          return;
        }
        if (it.product && typeof it.product.name === 'string' && it.product.name.trim()) {
          names.push(it.product.name.trim());
          return;
        }
        if (typeof it.name === 'string' && it.name.trim()) {
          names.push(it.name.trim());
          return;
        }
        if (typeof it.product_title === 'string' && it.product_title.trim()) {
          names.push(it.product_title.trim());
          return;
        }
        if (typeof it === 'string' && it.trim()) {
          names.push(it.trim());
          return;
        }
        try {
          const guess = JSON.stringify(it);
          if (guess && guess !== '{}' && guess.length < 80) names.push(guess);
        } catch (_) {}
      });
    }

    if (names.length) {
      if (names.length <= 2) return names.join(', ');
      return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    }

    if (row.product_summary && String(row.product_summary).trim()) return row.product_summary;
    return '-';
  }

  // salesperson extractor tries many shapes
  function salespersonText(row: Q) {
    const anyRow = row as any;
    const candidates = [
      anyRow.salesperson,
      anyRow.sales_person,
      anyRow.salesperson_name,
      anyRow.sales_person_name,
      anyRow.salesperson?.name,
      anyRow.sales_person?.name,
      anyRow.sales_personnel,
      anyRow.sales_personnel?.name,
      anyRow.sales_rep,
      anyRow.sales_rep?.name,
      anyRow.owner,
      anyRow.owner?.name,
    ];

    for (const c of candidates) {
      if (c == null) continue;
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (typeof c === 'object' && c && typeof c.name === 'string' && c.name.trim()) return c.name.trim();
    }

    if (anyRow.meta && typeof anyRow.meta === 'object') {
      const m = anyRow.meta.salesperson || anyRow.meta.sales_person || anyRow.meta.owner;
      if (typeof m === 'string' && m.trim()) return m.trim();
      if (m && typeof m.name === 'string' && m.name.trim()) return m.name.trim();
    }

    return '-';
  }

  function handleView(id: number) {
    navigate(`/quotations/${id}`);
  }

  function handleEdit(id: number) {
    navigate(`/quotations/${id}/edit`);
  }

  async function handleDelete(id: number) {
    const ok = confirm('Are you sure you want to delete this quotation? This action cannot be undone.');
    if (!ok) return;

    try {
      await api.deleteQuotation(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
      alert('Failed to delete quotation');
    }
  }

  return (
    <Layout>
      <div style={styles.pagePadding}>
        <div style={styles.headerRow}>
          <h2>Quotations</h2>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); navigate('/create-quotation'); }}
            style={styles.newBtn}
          >
            + New Quotation
          </button>
        </div>

        <div style={styles.panel}>
          <div style={styles.controls}>
            <input placeholder="Search by quotation number, customer..." style={styles.search} />
            <select style={{ width: 140, padding: 8 }}>
              <option>All Status</option>
              <option>Pending</option>
              <option>Approved</option>
            </select>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); console.log('Export CSV clicked'); }}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', background: 'white' }}
            >
              Export CSV
            </button>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : (
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: 180 }} />
              </colgroup>

              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>Quote No.</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Products</th>
                  <th style={styles.th}>Salesperson</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={styles.td}>{r.quotation_no}</td>
                    <td style={styles.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}>{r.customer_name}</td>
                    <td style={styles.td}>{productListText(r)}</td>
                    <td style={styles.td}>{salespersonText(r)}</td>
                    <td style={{ ...styles.td, ...styles.amount }}>₹{Number(String(r.total_value || '0').replace(/[^0-9.-]+/g, '') || 0).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={styles.statusPill}>{r.status}</span>
                    </td>
                    <td style={styles.actionsCell}>
                      <div style={styles.actionGroup}>
                        <button
                          aria-label={`View ${r.quotation_no}`}
                          onClick={(e) => { e.preventDefault(); handleView(r.id); }}
                          style={{ ...styles.linkBtn }}
                          title="View"
                        >
                          View
                        </button>

                        <button
                          aria-label={`Edit ${r.quotation_no}`}
                          onClick={(e) => { e.preventDefault(); handleEdit(r.id); }}
                          style={{ ...styles.editBtn }}
                          title="Edit"
                        >
                          Edit
                        </button>

                        <button
                          aria-label={`Delete ${r.quotation_no}`}
                          onClick={(e) => { e.preventDefault(); handleDelete(r.id); }}
                          style={{ ...styles.deleteBtn }}
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan={8} style={styles.emptyRow}>
                      No quotations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
