import { Icon } from "./icons";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  value: string;
  onChange: (v: string) => void;
  resultCount: number;
  totalCount: number;
  history: string[];
  onClearHistory: () => void;
  activeCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  categories: string[];
}

export function SearchBar({
  value,
  onChange,
  resultCount,
  totalCount,
  history,
  onClearHistory,
  activeCategory,
  onCategoryChange,
  categories,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
        setHighlightedIndex(-1);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  const showDropdown = showHistory && !value && history.length > 0;
  const hasFilters = categories.length > 0;

  return (
    <div className="px-6 pt-3 pb-2" ref={containerRef}>
      <div className="relative mx-auto max-w-xl">
        {/* macOS Spotlight-style capsule */}
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500">
          <Icon name="search" className="w-4 h-4" />
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowHistory(false);
          }}
          onFocus={() => {
            setFocused(true);
            if (!value) {
              setShowHistory(true);
              setHighlightedIndex(-1);
            }
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (!showDropdown) return;
            switch (e.key) {
              case "ArrowDown":
                e.preventDefault();
                setHighlightedIndex((i) =>
                  i >= history.length - 1 ? 0 : i + 1
                );
                break;
              case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex((i) =>
                  i <= 0 ? history.length - 1 : i - 1
                );
                break;
              case "Enter":
                if (highlightedIndex >= 0 && highlightedIndex < history.length) {
                  e.preventDefault();
                  onChange(history[highlightedIndex]);
                  setShowHistory(false);
                  setHighlightedIndex(-1);
                }
                break;
              case "Escape":
                setShowHistory(false);
                setHighlightedIndex(-1);
                break;
            }
          }}
          placeholder="搜索应用（支持拼音首字母和全拼）"
          className={
            "w-full rounded-xl border py-2.5 pl-10 pr-9 text-[14px] " +
            "text-ink-900 placeholder:text-ink-400 outline-none transition-all duration-200 " +
            (focused
              ? "border-ink-300/70 bg-white/95 ring-4 ring-ink-900/[0.04] dark:border-ink-600/70 dark:bg-ink-900/70 dark:ring-white/[0.03]"
              : "border-ink-200/60 bg-white/70 dark:border-ink-700/50 dark:bg-ink-900/50") +
            " dark:text-ink-50 dark:placeholder:text-ink-500"
          }
        />
        {value ? (
          <button
            onClick={() => onChange("")}
            title="清除"
            className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-ink-200"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
            <kbd className="rounded-md border border-ink-200/60 bg-ink-100/60 px-1.5 py-0.5 text-[11px] font-medium text-ink-400 dark:border-ink-700/60 dark:bg-ink-800/60 dark:text-ink-500">
              Ctrl+K
            </kbd>
          </span>
        )}

        {/* Search history dropdown */}
        {showDropdown && (
          <div className="animate-fade absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-ink-200/60 bg-white/95 shadow-lg backdrop-blur-xl dark:border-ink-700/60 dark:bg-ink-900/95">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-medium text-ink-400 dark:text-ink-500">
                最近搜索
              </span>
              <button
                onClick={onClearHistory}
                className="text-[11px] text-ink-400 hover:text-ink-600 dark:text-ink-500 dark:hover:text-ink-300"
              >
                清除记录
              </button>
            </div>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => {
                  onChange(h);
                  setShowHistory(false);
                  setHighlightedIndex(-1);
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors " +
                  (highlightedIndex === i
                    ? "bg-ink-100/80 text-ink-900 dark:bg-ink-800/60 dark:text-ink-50"
                    : "text-ink-700 hover:bg-ink-100/60 dark:text-ink-200 dark:hover:bg-ink-800/40")
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-400">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result count */}
      {value && (
        <div className="mt-2 text-center">
          {resultCount > 0 ? (
            <span className="text-[12px] text-ink-400 dark:text-ink-500">
              找到 <span className="font-medium text-ink-700 dark:text-ink-200">{resultCount}</span> 个应用（共 {totalCount} 个）
            </span>
          ) : (
            <span className="text-[12px] text-ink-400 dark:text-ink-500">
              未找到匹配的应用，试试拼音首字母？
            </span>
          )}
        </div>
      )}

      {/* Quick category filters */}
      {!value && hasFilters && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-ink-400 dark:text-ink-500">
            分类
          </span>
          <button
            onClick={() => onCategoryChange(null)}
            className={cn(
              buttonVariants({ variant: activeCategory === null ? "default" : "secondary", size: "sm" }),
              "rounded-lg px-2.5 py-1 text-[12px] font-medium",
              activeCategory === null && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(activeCategory === cat ? null : cat)}
              className={cn(
                buttonVariants({ variant: activeCategory === cat ? "default" : "secondary", size: "sm" }),
                "rounded-lg px-2.5 py-1 text-[12px] font-medium",
                activeCategory === cat && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}