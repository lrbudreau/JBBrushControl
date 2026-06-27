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
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
