import { useCallback, useRef, useState } from "react";

import type { Toast } from "../types";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<number[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type: Toast["type"], title: string, message?: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-3), { id, type, title, message }]);
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, type === "error" ? 8000 : 5000);
      timers.current.push(timer);
    },
    [],
  );

  const success = useCallback(
    (title: string, message?: string) => push("success", title, message),
    [push],
  );
  const error = useCallback(
    (title: string, message?: string) => push("error", title, message),
    [push],
  );
  const info = useCallback(
    (title: string, message?: string) => push("info", title, message),
    [push],
  );

  return { toasts, remove, push, success, error, info };
}
