// src/components/Modal.tsx
import React from 'react';

type Props = {
  title?: string;
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Modal({ title, open, onClose, children, footer }: Props) {
  if (!open) return null;
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{width:720, maxWidth:'95%', background:'#fff', borderRadius:8, padding:20}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <h3 style={{margin:0}}>{title}</h3>
          <button onClick={onClose} aria-label="close">✕</button>
        </div>
        <div>{children}</div>
        {footer && <div style={{marginTop:16}}>{footer}</div>}
      </div>
    </div>
  );
}
