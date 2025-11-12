import React, { useState, useRef, useEffect } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TopBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <header className="bg-[#1a237e] text-white h-16 flex items-center px-6">
      <div className="flex-1 flex items-center">
        <h1 className="text-lg font-semibold">Prayosha Automation</h1>
        <span className="ml-2 text-sm text-white/70">Quotation Management System</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          aria-label="notifications"
          className="p-2 hover:bg-white/10 rounded-full relative"
          onClick={() => console.log('Open notifications')}
        >
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
        </button>

        <div className="relative" ref={ref}>
          <button
            className="flex items-center gap-3 pl-4 border-l border-white/20"
            onClick={() => setOpen((s) => !s)}
            aria-haspopup="true"
            aria-expanded={open}
          >
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">John Doe</div>
              <div className="text-xs text-white/70">ADMIN</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center text-sm font-medium">
              JD
            </div>
            <ChevronDown className="hidden sm:block" size={16} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-48 bg-white text-black rounded-md shadow-md ring-1 ring-black/5 z-50">
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => {
                  setOpen(false);
                  nav('/profile');
                }}
              >
                View Profile
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => {
                  setOpen(false);
                  // placeholder logout flow
                  console.log('Logout clicked');
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;