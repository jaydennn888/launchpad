import { Icon } from "./icons";
import { useEffect, useState, useCallback } from "react";
import type { ClipboardEntry } from "../types";
import {
  readClipboard,
  getClipboardHistory,
  writeClipboard,
  clearClipboardHistory,
  deleteClipboardEntry,
} from "../lib/invoke";

export default function ClipboardHistory() {
  const [history, setHistory] = useState<ClipboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await getClipboardHistory();
      setHistory(list);
    } catch {
      /* ignore */
    }
  }, []);

  // Initial load + periodic clipboard monitoring (reduced to 5s)
  useEffect(() => {
    refresh();
    const timer = setInterval(async () => {
      try {
        await readClipboard();
        const list = await getClipboardHistory();
        // Only update if list actually changed to avoid re-renders
        setHistory((prev) => {
          if (prev.length === list.length && prev.length > 0) {
            const prevIds = new Set(prev.map((e) => e.id));
            if (list.every((e) => prevIds.has(e.id))) return prev;
          }
          return list;
        });
      } catch {
        /* ignore clipboard errors */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const copyItem = async (text: string) => {
    try {
      await writeClipboard(text);
      setToast("已复制到剪贴板");
    } catch {
      setToast("复制失败");
    }
  };

  const removeItem = async (id: string) => {
    try {
      await deleteClipboardEntry(id);
      setHistory((prev) => prev.filter((e) => e.id !== id));
    } catch {
      /* ignore */
    }
  };

  const clearAll = async () => {
    try {
      await clearClipboardHistory();
      setHistory([]);
      setToast("已清空历史");
    } catch {
      /* ignore */
    }
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="col-span-1 rounded-2xl bg-white/50 dark:bg-ink-800/30 backdrop-blur border border-ink-200/20 dark:border-ink-700/20 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />剪贴板历史</h3>
        {history.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[10px] text-ink-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="清空历史"
          >
            清空
          </button>
        )}
      </div>

      {history.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto text-ink-300 dark:text-ink-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <p className="text-xs text-ink-400 dark:text-ink-500">复制内容将自动记录</p>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1 min-h-0 overflow-y-auto">
        {history.slice(0, 8).map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-ink-100/40 dark:hover:bg-ink-700/20 transition-all cursor-pointer"
            onClick={() => copyItem(item.text)}
            title="点击复制"
          >
            <svg className="w-3.5 h-3.5 text-ink-300 dark:text-ink-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-ink-700 dark:text-ink-200 truncate">{item.text}</p>
              <p className="text-[9px] text-ink-400 dark:text-ink-500">{formatTime(item.timestamp)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
              title="删除"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        ))}
        {history.length > 8 && (
          <p className="text-[10px] text-ink-400 dark:text-ink-500 text-center py-1">
            还有 {history.length - 8} 条...
          </p>
        )}
      </div>

      {toast && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 px-2.5 py-1 rounded-lg shadow-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
