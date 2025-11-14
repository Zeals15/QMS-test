import React, { useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Click tracer: capturing phase so we log before other handlers run
    const onClick = (e: MouseEvent) => {
      try {
        const t = e.target as HTMLElement | null;
        const path = (e.composedPath && e.composedPath().map((el: any) => {
          try { return el && (el.tagName || el.nodeName || (el.constructor && el.constructor.name)); } catch (_) { return null; }
        }).filter(Boolean)) || [];

        // Friendly object for console
        const info = {
          time: new Date().toISOString(),
          tag: t?.tagName,
          id: t?.id || null,
          classes: t?.className || null,
          innerText: (t?.innerText || '').slice(0, 120),
          path,
        };
        console.log('--- CLICK TRACE ---', info);
      } catch (err) {
        // swallow tracer errors
        console.error('click tracer error', err);
      }
    };

    // Instrument history push/replace to see programmatic navigations
    const origPush = (history as any).pushState;
    const origReplace = (history as any).replaceState;

    (history as any).pushState = function (...args: any[]) {
      console.log('--- history.pushState called ---', args);
      return origPush.apply(this, args);
    };
    (history as any).replaceState = function (...args: any[]) {
      console.log('--- history.replaceState called ---', args);
      return origReplace.apply(this, args);
    };

    const onBeforeUnload = () => console.log('--- beforeunload firing (page will unload/reload) ---');

    // add capturing listener so we see it before other handlers
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      (history as any).pushState = origPush;
      (history as any).replaceState = origReplace;
    };
  }, []);

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
