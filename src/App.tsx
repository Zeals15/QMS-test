import type { ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Quotations from './pages/Quotations';
import CreateQuotation from './pages/CreateQuotation';
import Products from './pages/Products';
import Customers from './pages/Customers';

function Protected({ children }: { children: ReactElement }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function App(){
  return (
    <Routes>
      
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<Protected><Dashboard/></Protected>} />
      <Route path="/quotations" element={<Protected><Quotations/></Protected>} />
      <Route path="/create-quotation" element={<Protected><CreateQuotation/></Protected>} />
      <Route path="/products" element={<Protected><Products/></Protected>} />
      <Route path="/customers" element={<Protected><Customers/></Protected>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
