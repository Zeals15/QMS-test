import React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

const Input: React.FC<Props> = ({ label, className = '', ...rest }) => {
  return (
    <label className="flex flex-col text-sm gap-1">
      {label && <span className="text-slate-700">{label}</span>}
      <input className={`border border-gray-200 rounded-md p-3 focus:outline-none focus:shadow-[0_0_0_4px_rgba(244,98,90,0.12)] ${className}`} {...rest} />
    </label>
  );
};

export default Input;
