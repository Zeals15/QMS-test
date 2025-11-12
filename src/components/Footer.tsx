import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[hsl(var(--color-navy))] text-white py-4 px-6 mt-8">
      <div className="max-w-7xl mx-auto text-sm flex items-center justify-between">
        <div>© {new Date().getFullYear()} Prayosha Automation</div>
        <div className="flex gap-4">
          <a className="underline" href="#">Privacy</a>
          <a className="underline" href="#">Terms</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
