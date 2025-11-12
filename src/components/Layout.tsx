import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

const Layout: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <div className="min-h-screen bg-surfaceGray text-[hsl(var(--text-default))]">
      <Header />
      <Sidebar />
      <main className="pt-20 pl-64 md:pl-64 transition-padding min-h-[calc(100vh-64px)]">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
};

export default Layout;
