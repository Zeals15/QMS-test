import React from 'react';
import { Bell, User } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-[hsl(var(--color-navy))] text-white flex items-center justify-between px-4 md:px-6 h-16 fixed top-0 left-0 right-0 z-40">
      <div className="flex items-center gap-3">
        <img src="/logo192.png" alt="Prayosha" className="h-8 w-auto" />
        <span className="font-poppins font-bold text-lg">Prayosha Automation</span>
      </div>
      <div className="flex items-center gap-3">
        <button aria-label="notifications" className="p-2 rounded-md hover:bg-white/10">
          <Bell size={20} />
        </button>
        <div className="flex items-center gap-2 p-1 rounded-md hover:bg-white/5">
          <div className="h-8 w-8 bg-surfaceGray rounded-full flex items-center justify-center text-navy"> 
            <User size={16} />
          </div>
          <div className="hidden md:block text-sm">Hi, Admin</div>
        </div>
      </div>
    </header>
  );
};

export default Header;
