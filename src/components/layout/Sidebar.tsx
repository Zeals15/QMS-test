import React from 'react';
import { LayoutDashboard, FileText, Users, Package, BarChart2, Settings } from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  isActive?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard', isActive: true },
  { label: 'Quotations', icon: <FileText size={20} />, path: '/quotations' },
  { label: 'Customers', icon: <Users size={20} />, path: '/customers' },
  { label: 'Products', icon: <Package size={20} />, path: '/products' },
  { label: 'Reports', icon: <BarChart2 size={20} />, path: '/reports' },
  { label: 'Settings', icon: <Settings size={20} />, path: '/settings' },
];

const Sidebar: React.FC = () => {
  return (
    <aside className="bg-white w-64 min-h-screen border-r border-gray-200">
      <div className="p-6">
        <img src="/logo.png" alt="Prayosha" className="h-8 mb-8" />
        <nav className="space-y-1">
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${
                  item.isActive
                    ? 'bg-rose-50 text-rose-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;