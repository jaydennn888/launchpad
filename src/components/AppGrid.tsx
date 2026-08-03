import { Icon } from "./icons";
import { useState, useMemo } from "react";
import type { AppInfo } from "../types";
import { AppTile } from "./AppTile";
import { groupByCategory } from "../lib/categories";

interface Props {
  apps: AppInfo[];
  pinnedIds: string[];
  grayscale: boolean;
  query: string;
  activeCategory: string | null;
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
}

export function AppGrid({
  apps,
  pinnedIds,
  grayscale,
  query,
  activeCategory,
  onLaunch,
  onTogglePin,
  onContext,
}: Props) {
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const set = new Set(pinnedIds);

  const isCategoryFiltered = activeCategory !== null;
  const groups = useMemo(() => (grouped && !isCategoryFiltered ? groupByCategory(apps) : []), [apps, grouped, isCategoryFiltered]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (apps.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-50 text-ink-faint dark:bg-ink-800/30 dark:text-ink-faint">
            {query ? (
              <Icon name="search" className="w-5 h-5" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            )}
          </div>
          <div className="text-[12px] text-ink-muted dark:text-ink-muted">
            {query ? (
              <>
                <p className="mb-0.5 font-medium text-ink-muted">未找到 "{query}"</p>
                <p className="text-[11px] text-ink-faint">试试拼音首字母</p>
              </>
            ) : (
              <>
                <p className="mb-0.5 font-medium text-ink-muted">未发现已安装应用</p>
                <p className="text-[11px] text-ink-faint">点击左下角刷新按钮重新扫描</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const grid = (list: AppInfo[]) => (
    <div className="grid justify-items-center gap-x-3 gap-y-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
      {list.map((app) => (
        <div key={app.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 104px" }}>
          <AppTile
            app={app}
            pinned={set.has(app.id)}
            grayscale={grayscale}
            onLaunch={onLaunch}
            onTogglePin={onTogglePin}
            onContext={onContext}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="label-mono">
          {activeCategory ? `${activeCategory} · ${apps.length}` : `全部应用 · ${apps.length}`}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent dark:from-line" />
        {!isCategoryFiltered && (
          <button
            onClick={() => setGrouped((g) => !g)}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all btn-micro ${
              grouped ? "bg-accent-soft text-accent" : "text-ink-faint hover:bg-ink-100/40"
            }`}
            title={grouped ? "切换为平铺视图" : "切换为分类视图"}
          >
            {grouped ? "分类" : "平铺"}
          </button>
        )}
      </div>

      {grouped && !isCategoryFiltered ? (
        <div className="space-y-4">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id}>
                <div
                  draggable
                  onDragStart={(e) => {
                    const payload = JSON.stringify({ kind: "category", categoryId: g.id, categoryName: g.name, apps: g.apps });
                    e.dataTransfer.setData("text/plain", payload);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => toggleCollapse(g.id)}
                  className="group mb-1.5 flex w-full cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-ink-100/30 active:cursor-grabbing dark:hover:bg-ink-800/20"
                  title="拖拽整个分类到左侧文件夹 · 点击折叠/展开"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 text-ink-faint transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="text-[12px] font-medium text-ink-muted dark:text-ink-muted">{g.name}</span>
                  <span className="rounded bg-ink-50 px-1 py-0 text-[9px] font-medium text-ink-faint dark:bg-ink-800/30">{g.apps.length}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="ml-auto shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" />
                    <circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                {!isCollapsed && (
                  <div className="animate-enter">{grid(g.apps)}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        grid(apps)
      )}
    </div>
  );
}
