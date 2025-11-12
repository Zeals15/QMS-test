import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login(){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  async function handleLogin(e: React.FormEvent){
    e.preventDefault();
    try{
      const res = await api.login({ email, password });
      // expected response: { token, user }
      if (res && res.token) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('token', res.token);
        navigate('/dashboard');
      } else {
        alert('Login failed: unexpected response');
      }
    }catch(err:any){
      console.error('Login error', err);
      alert(err?.message || 'Login failed');
    }
  }

  return (
    <div style={{minHeight: '100vh', display:'flex', flexDirection: 'row'}}>
      {/* left gradient panel */}
      <div style={{flex:1, minHeight:'100vh', padding:40, color:'#fff', display:'flex', flexDirection:'column', justifyContent:'space-between', background: 'linear-gradient(135deg, #ff6b61 0%, #b64fa8 60%, #3b2f6b 100%)'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:40, height:40, borderRadius:8, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700}}>P</div>
            <div style={{fontWeight:700}}>Prayosha Automation</div>
          </div>

          <h1 style={{marginTop:30, fontSize:32, lineHeight:1.05}}>Quotation Management System</h1>
          <p style={{marginTop:12, opacity:0.95, maxWidth:420}}>Streamline your quotation workflow with our secure and efficient platform.</p>
        </div>

        <div style={{fontSize:14, opacity:0.95}}>
          <ul style={{paddingLeft:18}}>
            <li style={{marginBottom:8}}>Create & manage quotations</li>
            <li style={{marginBottom:8}}>Generate PDF exports</li>
            <li>Email directly to customers</li>
          </ul>
        </div>
      </div>

      {/* right form area */}
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40, background:'#fff'}}>
        <div style={{width:420, maxWidth:'100%', background:'#fff', border:'1px solid #eef0f2', borderRadius:8, padding:24, boxShadow:'0 6px 20px rgba(10,10,10,0.06)'}}>
          <h2 style={{margin:0, marginBottom:8, color:'#0f172a'}}>Welcome back</h2>
          <p style={{margin:0, marginBottom:18, color:'#6b7280'}}>Enter your credentials to access your account</p>

          <form onSubmit={handleLogin}>
            <label style={{display:'block', fontSize:12, color:'#374151', marginBottom:6}}>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              required
              style={{width:'100%', padding:'10px 12px', border:'1px solid #e6e9ee', borderRadius:6, marginBottom:12}}
            />

            <label style={{display:'block', fontSize:12, color:'#374151', marginBottom:6}}>Password</label>
            <input
              type="password"
              placeholder=""
              value={password}
              onChange={e=>setPassword(e.target.value)}
              required
              style={{width:'100%', padding:'10px 12px', border:'1px solid #e6e9ee', borderRadius:6, marginBottom:12}}
            />

            <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
              <a style={{fontSize:12, color:'#ff6b61', textDecoration:'none'}}>Forgot password?</a>
            </div>

            <button type="submit" style={{width:'100%', padding:'10px', background:'#ff6b61', color:'#fff', border:'none', borderRadius:6}}>Sign in</button>
          </form>
        </div>
      </div>
    </div>
  );
}