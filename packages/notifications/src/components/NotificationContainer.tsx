"use client";

import { useEffect, useRef, useState } from "react";

export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Props {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

const MAX_VISIBLE = 3;

const STYLES = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200/60",
    icon: "text-emerald-600",
    title: "text-emerald-900",
    message: "text-emerald-700",
    close: "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-100",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200/60",
    icon: "text-red-600",
    title: "text-red-900",
    message: "text-red-700",
    close: "text-red-400 hover:text-red-600 hover:bg-red-100",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200/60",
    icon: "text-amber-600",
    title: "text-amber-900",
    message: "text-amber-700",
    close: "text-amber-400 hover:text-amber-600 hover:bg-amber-100",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200/60",
    icon: "text-blue-600",
    title: "text-blue-900",
    message: "text-blue-700",
    close: "text-blue-400 hover:text-blue-600 hover:bg-blue-100",
  },
} as const;

const ICONS = {
  success: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />,
  error: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />,
  warning: <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />,
  info: <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />,
} as const;

export function NotificationContainer({ notifications, onRemove }: Props) {
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const visible = notifications.slice(-MAX_VISIBLE);
  const visibleIds = new Set(visible.map(n => n.id));

  // Enter animation + cleanup stale state
  useEffect(() => {
    visible.forEach(n => {
      if (!entered.has(n.id) && !exiting.has(n.id)) {
        requestAnimationFrame(() => setEntered(p => new Set(p).add(n.id)));
      }
    });
    setEntered(p => new Set(Array.from(p).filter(id => visibleIds.has(id))));
  }, [notifications]);

  // Auto-dismiss timers
  useEffect(() => {
    visible.forEach(n => {
      if (n.duration !== 0 && !timers.current.has(n.id) && !exiting.has(n.id)) {
        timers.current.set(n.id, setTimeout(() => autoDismiss(n.id), n.duration || 5000));
      }
    });
    // Cleanup old timers
    timers.current.forEach((t, id) => {
      if (!visibleIds.has(id)) {
        clearTimeout(t);
        timers.current.delete(id);
      }
    });
  }, [notifications]);

  // Cleanup on unmount
  useEffect(() => () => timers.current.forEach(t => clearTimeout(t)), []);

  const autoDismiss = (id: string) => {
    timers.current.delete(id);
    setExiting(p => new Set(p).add(id));
    setTimeout(() => {
      setExiting(p => { const n = new Set(p); n.delete(id); return n; });
      onRemove(id);
    }, 200);
  };

  const dismiss = (id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setExiting(p => { const n = new Set(p); n.delete(id); return n; });
    onRemove(id);
  };

  if (!visible.length) return null;

  const hiddenCount = notifications.length - MAX_VISIBLE;

  return (
    <div className="fixed top-6 right-6 z-[60] w-[380px]">
      <div className="relative h-20">
        {visible.map((item, i) => {
          const s = STYLES[item.type];
          const isEntered = entered.has(item.id);
          const isExiting = exiting.has(item.id);
          const depth = visible.length - 1 - i;

          return (
            <div
              key={item.id}
              className={`${s.bg} ${s.border} absolute top-0 left-0 right-0 rounded-xl border shadow-lg shadow-black/5 overflow-hidden`}
              style={{
                opacity: isExiting ? 0 : isEntered ? 1 : 0,
                transform: isExiting
                  ? "translateY(-10px) scale(0.95)"
                  : isEntered
                  ? `translateY(${depth * 6}px) scale(${1 - depth * 0.03})`
                  : "translateY(-10px) scale(0.95)",
                transition: "opacity 200ms, transform 200ms",
                zIndex: i + 1,
              }}
            >
              <button
                onClick={() => dismiss(item.id)}
                className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${s.close}`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>

              <div className={item.title ? "px-4 py-4 pr-10" : "px-4 py-3 pr-10"}>
                <div className="flex items-start gap-3">
                  <svg className={`h-5 w-5 flex-shrink-0 ${s.icon}`} viewBox="0 0 20 20" fill="currentColor">
                    {ICONS[item.type]}
                  </svg>
                  <div className="flex-1 min-w-0">
                    {item.title && (
                      <p className={`text-sm font-semibold truncate ${s.title}`}>{item.title}</p>
                    )}
                    <p
                      className={`text-sm break-words ${s.message} ${item.title ? "mt-0.5" : ""}`}
                      style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      {item.message}
                    </p>
                    {item.action && (
                      <button onClick={item.action.onClick} className={`mt-2 text-sm font-medium hover:underline ${s.icon}`}>
                        {item.action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2" style={{ zIndex: visible.length + 1 }}>
          <div className="px-2.5 py-1 rounded-full bg-gray-900/90 text-white text-xs font-medium shadow-lg">
            +{hiddenCount} more
          </div>
        </div>
      )}
    </div>
  );
}
