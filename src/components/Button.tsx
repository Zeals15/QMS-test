import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline';
  children: React.ReactNode;
};

const Button: React.FC<Props> = ({ variant = 'primary', children, className = '', ...rest }) => {
  const base = 'px-4 py-2 rounded-md font-medium disabled:opacity-60';
  const styles = {
    primary: `bg-[hsl(var(--color-coral))] text-white hover:brightness-95`,
    secondary: `bg-gray-100 text-slate-700 hover:shadow-md`,
    outline: `border border-gray-200 bg-white text-slate-700 hover:bg-[hsl(var(--color-coral))] hover:text-white`,
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
};

export default Button;
