// src/pages/Customers.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import Layout from '../components/layout/Layout';

type C = { id:number, company_name:string, contact_person:string, phone:string, email:string, gstin:string };

export default function Customers() {
  const [rows, setRows] = useState<C[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({company_name:'', contact_person:'', address:'', phone:'', email:'', gstin:''});

  useEffect(()=>{ load() },[]);

  async function load(){
    try{
      const data = await api.getCustomers();
      setRows(data);
    }catch(e){ console.error(e); alert('Failed to fetch customers'); }
  }

  async function submit(){
    try{
      await api.addCustomer(form);
      setOpen(false);
      setForm({company_name:'', contact_person:'', address:'', phone:'', email:'', gstin:''});
      load();
    }catch(e){ console.error(e); alert('Failed to add'); }
  }

  return (
    <Layout>
      <div style={{padding:24}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h2>Customers</h2>
        <button onClick={()=>setOpen(true)} style={{background:'#ff6b61', color:'#fff', padding:8, borderRadius:6}}>+ Add Customer</button>
      </div>

      <div style={{background:'#fff', padding:16, borderRadius:8}}>
        <input placeholder="Search customers..." style={{width:'100%', padding:8, marginBottom:12}}/>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead><tr style={{borderBottom:'1px solid #eee'}}>
            <th style={{padding:8}}>Company Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>GSTIN</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{borderBottom:'1px solid #f5f5f5'}}>
                <td style={{padding:10}}>{r.company_name}</td>
                <td>{r.contact_person}</td>
                <td>{r.phone}</td>
                <td>{r.email}</td>
                <td>{r.gstin}</td>
                <td><button>Edit</button> <button>Delete</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} style={{padding:20}}>No customers</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal title="Add New Customer" open={open} onClose={()=>setOpen(false)} footer={
        <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
          <button onClick={()=>setOpen(false)}>Cancel</button>
          <button onClick={submit} style={{background:'#ff6b61', color:'#fff'}}>Add Customer</button>
        </div>
      }>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          <input placeholder="Company Name *" value={form.company_name} onChange={e=>setForm({...form, company_name:e.target.value})}/>
          <input placeholder="Contact Person" value={form.contact_person} onChange={e=>setForm({...form, contact_person:e.target.value})}/>
          <input placeholder="Address" value={form.address} onChange={e=>setForm({...form, address:e.target.value})}/>
          <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}/>
          <input placeholder="Email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})}/>
          <input placeholder="GSTIN" value={form.gstin} onChange={e=>setForm({...form, gstin:e.target.value})}/>
        </div>
      </Modal>
      </div>
    </Layout>
  );
}
