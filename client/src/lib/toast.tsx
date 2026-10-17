import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

interface ToastValue {
  toast: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((text: string, error?: boolean) => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, text, error }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const value = useMemo<ToastValue>(
    () => ({ toast: (t) => push(t, false), error: (t) => push(t, true) }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast${t.error ? ' toast--error' : ''}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider');
  return ctx;
}
