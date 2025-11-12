// src/pages/Quotations.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';

type Q = { id:number, quotation_no:string, customer_name:string, total_value:string, status:string, created_at:string };

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
      setRows(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load quotations');
    } finally { setLoading(false); }
  }

  return (
    <Layout>
      <div style={{ padding: '24px 32px' }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h2>Quotations</h2>
        <button onClick={()=>navigate('/create-quotation')} style={{background:'#ff6b61', color:'#fff', padding:'8px 12px', borderRadius:6}}>+ New Quotation</button>
      </div>

      <div style={{ background:'#fff', padding:16, borderRadius:8 }}>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <input placeholder="Search by quotation number, customer..." style={{flex:1, padding:8}} />
          <select style={{width:140}}>
            <option>All Status</option>
            <option>Pending</option>
            <option>Approved</option>
          </select>
          <button>Export CSV</button>
        </div>

        {loading ? <div>Loading...</div> : (
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{textAlign:'left', borderBottom:'1px solid #eee'}}>
                <th style={{padding:'12px'}}>Quote No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Salesperson</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{borderBottom:'1px solid #f2f2f2'}}>
                  <td style={{padding:12}}>{r.quotation_no}</td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>{r.customer_name}</td>
                  <td>-</td>
                  <td>₹{Number(r.total_value).toLocaleString()}</td>
                  <td><span style={{padding:'4px 8px', borderRadius:6, background:'#eef'}}>{r.status}</span></td>
                  <td>
                    <button onClick={()=>navigate(`/quotations/${r.id}`)}>View</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} style={{padding:24}}>No quotations found</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </Layout>
  );
}
