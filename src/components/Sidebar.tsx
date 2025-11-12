import React, { useState } from 'react';
import { Home, FileText, Users, Box, BarChart2, Settings, Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/quotations', label: 'Quotations', icon: FileText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Box },
  { to: '/reports', label: 'Reports', icon: BarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`h-screen pt-16 fixed top-0 left-0 z-30 bg-white border-r w-64 ${collapsed ? 'w-20' : 'w-64'} transition-all`}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <img src="/logo192.png" alt="logo" className="h-8" />
          {!collapsed && <span className="font-poppins font-bold">Prayosha</span>}
        </div>
        <button onClick={() => setCollapsed(s => !s)} aria-label="toggle menu" className="p-2 rounded-md hover:bg-gray-50 mr-1">
          <Menu size={18} />
        </button>
      </div>
      <nav className="px-2 py-4 flex flex-col gap-1">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <NavLink key={it.to} to={it.to} className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-gray-50 ${isActive ? 'bg-[hsl(var(--color-coral))]/10 text-[hsl(var(--color-coral))]' : 'text-slate-700'}`}>
              <Icon size={18} />
              {!collapsed && <span>{it.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
