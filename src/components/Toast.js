import { useState, useCallback, useRef } from 'react';

let _add = null;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const add = useCallback((msg, type = 'success') => {
    const id = ++counter.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  _add = add;
  return { toasts, toast: add };
}

export function toast(msg, type = 'success') {
  if (_add) _add(msg, type);
}

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', top:64, left:'50%', transform:'translateX(-50%)', zIndex:9999, display:'flex', flexDirection:'column', gap:8, width:'calc(100% - 32px)', maxWidth:448 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding:'13px 18px', borderRadius:8, fontSize:14, fontWeight:600,
          boxShadow:'0 4px 12px rgba(0,0,0,0.15)', color:'white', animation:'toastIn 0.2s ease',
          background: t.type==='error' ? '#dc2626' : t.type==='info' ? '#1d6fa4' : '#2d6a2d'
        }}>{t.msg}</div>
      ))}
    </div>
  );
}
