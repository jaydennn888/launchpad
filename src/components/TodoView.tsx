import { Icon } from "./icons";
import { useState, useEffect, useCallback } from "react";
import type { TodoItem } from "../types";

type Filter = "all" | "active" | "done";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

const STORAGE_KEY = "launchpad_todos";

export default function TodoView() {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TodoItem[]) : [];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const addTodo = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const item: TodoItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
    };
    setTodos((prev) => [item, ...prev]);
    setText("");
  }, [text]);

  const toggleDone = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-ink-200/50 dark:border-ink-800/30">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">
            待办事项
          </h2>
          <span className="text-xs text-ink-400">{todos.length} 项</span>
        </div>
      </div>

      <div className="px-6 py-3 flex gap-2">
        <input
          className="flex-1 px-4 py-2 rounded-xl bg-white/50 dark:bg-ink-800/30 border border-ink-200/50 dark:border-ink-800/40 text-sm text-ink-900 dark:text-ink-100 placeholder-ink-400 outline-none focus:ring-2 focus:ring-accent/40 transition-shadow"
          placeholder="添加待办事项..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          maxLength={200}
        />
        <button
          onClick={addTodo}
          disabled={!text.trim()}
          className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          添加
        </button>
      </div>

      <div className="px-6 py-2 flex gap-2">
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? "bg-accent text-white"
                : "text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800/30"
            }`}
          >
            {f === "all" ? "全部" : f === "active" ? "进行中" : "已完成"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-400 gap-3">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">暂无待办事项</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-ink-800/20 group"
              >
                <button
                  onClick={() => toggleDone(todo.id)}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    todo.done
                      ? "bg-accent border-accent"
                      : "border-ink-300 dark:border-ink-600 hover:border-accent"
                  }`}
                >
                  {todo.done && (
                    <Icon name="check" className="w-3 h-3" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm block truncate ${todo.done ? "line-through text-ink-400" : "text-ink-900 dark:text-ink-100"}`}>
                    {todo.text}
                  </span>
                  <span className="text-xs text-ink-400">{relativeTime(todo.createdAt)}</span>
                </div>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-red-500 flex-shrink-0"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-6 py-3 border-t border-ink-200/50 dark:border-ink-800/30">
        <p className="text-xs text-ink-400 text-center">
          共 {todos.length} 项，{doneCount} 项已完成
        </p>
      </div>
    </div>
  );
}