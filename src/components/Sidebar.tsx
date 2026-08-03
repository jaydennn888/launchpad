import { useState, useCallback, useEffect, useRef } from "react";
import type { SidebarItem, AppInfo } from "../types";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  createSidebarItem,
  deleteSidebarItem,
  updateSidebarItem,
} from "../lib/invoke";
import { getLunarDate, type LunarDate } from "../lib/lunar";

type NavView = "dashboard" | "apps" | "notes" | "trending" | "todo";

/** Payload dragged from the app grid. */
interface DragApp { kind: "app"; app: AppInfo }
interface DragCategory { kind: "category"; categoryId: string; categoryName: string; apps: AppInfo[] }
type DragPayload = DragApp | DragCategory;

interface Props {
  items: SidebarItem[];
  onItemsChange: () => void;
  onLaunchApp: (lnkPath: string) => void;
  onSelectNote: (item: SidebarItem | null) => void;
  selectedNoteId: string | null;
  onToast: (msg: string) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onShowAllApps: () => void;
  onOpenWebView: (url: string, title: string) => void;
  onOpenInChrome: (url: string) => void;
  onRescan: () => void;
  activeView?: "dashboard" | "apps" | "trending" | "todo";
  onSwitchView?: (view: "dashboard" | "apps" | "trending" | "todo") => void;
  userName?: string;
}

export function Sidebar({
  items,
  onItemsChange,
  onLaunchApp,
  onSelectNote,
  selectedNoteId,
  onToast,
  selectedFolderId,
  onSelectFolder,
  onShowAllApps,
  onOpenWebView,
  onOpenInChrome,
  onRescan,
  activeView = "apps",
  onSwitchView,
  userName = "张总",
}: Props) {
  const [nav, setNav] = useState<NavView>(() => {
    if (activeView === "dashboard") return "dashboard";
    if (activeView === "trending") return "trending";
    if (activeView === "todo") return "todo";
    return "apps";
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const [currentDateTime, setCurrentDateTime] = useState<{
    date: string;
    time: string;
    lunar: LunarDate | null;
  }>({ date: "", time: "", lunar: null });

  // real-time clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
      const timeStr = now.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const lunar = getLunarDate(now);
      setCurrentDateTime({ date: dateStr, time: timeStr, lunar });
    };
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, []);

  // Sync nav with activeView prop
  useEffect(() => {
    if (activeView === "dashboard" && nav !== "dashboard") setNav("dashboard");
    else if (activeView === "trending" && nav !== "trending") setNav("trending");
    else if (activeView === "todo" && nav !== "todo") setNav("todo");
    else if (activeView === "apps" && (nav === "trending" || nav === "dashboard" || nav === "todo")) setNav("apps");
  }, [activeView]);

  const folders = items.filter((i) => i.itemType === "folder" && !i.parentId);
  const notes = items.filter((i) => i.itemType === "note" && !i.parentId);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewFolder = useCallback(async () => {
    try {
      const item = await createSidebarItem("folder", "新文件夹", null);
      onItemsChange();
      setExpanded((prev) => new Set(prev).add(item.id));
      setRenamingId(item.id);
      setRenameValue("新文件夹");
    } catch {
      onToast("创建失败");
    }
  }, [onItemsChange, onToast]);

  const handleNewNote = useCallback(async () => {
    try {
      const item = await createSidebarItem("note", "新备忘录", null);
      onItemsChange();
      setNav("notes");
      onSelectNote(item);
    } catch {
      onToast("创建失败");
    }
  }, [onItemsChange, onSelectNote, onToast]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSidebarItem(id);
        onItemsChange();
        onSelectNote(null);
      } catch {
        onToast("删除失败");
      }
    },
    [onItemsChange, onSelectNote, onToast],
  );

  const handleRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      if (!name) { setRenamingId(null); return; }
      try {
        await updateSidebarItem(id, name);
        onItemsChange();
      } catch {
        onToast("重命名失败");
      }
      setRenamingId(null);
    },
    [renameValue, onItemsChange, onToast],
  );

  const startRename = useCallback((id: string, name: string) => {
    setRenamingId(id);
    setRenameValue(name);
  }, []);

  const parsePayload = (data: string): DragPayload | null => {
    if (!data) return null;
    try {
      const obj = JSON.parse(data);
      if (obj && typeof obj === "object" && "kind" in obj) {
        if (obj.kind === "category") return { kind: "category", categoryId: obj.categoryId, categoryName: obj.categoryName, apps: obj.apps };
        if (obj.kind === "app") return { kind: "app", app: obj.app };
      }
      if (obj && typeof obj === "object" && ("lnkPath" in obj || "id" in obj)) {
        return { kind: "app", app: obj as AppInfo };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverFolder(null);
      const raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/json");
      const payload = parsePayload(raw);
      if (!payload) return;
      try {
        if (payload.kind === "app") {
          const app = payload.app;
          const exists = items.some((i) => i.itemType === "app" && i.appId === app.id && (i.parentId ?? null) === (folderId ?? null));
          if (exists) { onToast("该应用已在此文件夹中"); return; }
          await createSidebarItem("app", app.name, folderId, app.id, app.name, app.icon ?? undefined);
          onItemsChange();
          onToast(`已添加 ${app.name}`);
        } else {
          const apps = payload.apps;
          let added = 0; let skipped = 0;
          for (const app of apps) {
            const exists = items.some((i) => i.itemType === "app" && i.appId === app.id && (i.parentId ?? null) === (folderId ?? null));
            if (exists) { skipped++; continue; }
            try {
              await createSidebarItem("app", app.name, folderId, app.id, app.name, app.icon ?? undefined);
              added++;
            } catch { /* skip */ }
          }
          onItemsChange();
          if (added > 0) onToast(`已添加 ${added} 个应用${skipped > 0 ? `（${skipped} 个已存在）` : ""}`);
          else onToast("该分类的应用已全部在此文件夹中");
        }
        if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
      } catch {
        onToast("添加失败");
      }
    },
    [items, onItemsChange, onToast],
  );

  const childrenOf = (parentId: string) => items.filter((i) => i.parentId === parentId);

  const switchNav = (next: NavView) => {
    setNav(next);
    if (next === "apps") { onShowAllApps(); onSwitchView?.("apps"); }
    else if (next === "trending") onSwitchView?.("trending");
    else if (next === "dashboard") onSwitchView?.("dashboard");
    else if (next === "todo") onSwitchView?.("todo");
  };

  const listItems = nav === "notes" ? notes : folders;
  const listTitle = nav === "notes" ? "备忘录" : "文件夹";

  return (
    <div className="flex h-full">
      {/* ============ Narrow icon rail ============ */}
      <div className="flex w-11 shrink-0 flex-col items-center justify-between border-r border-ink-200/30 py-2.5 dark:border-ink-700/30">
        <div className="flex flex-col items-center gap-0.5">
          <NavIcon active={nav === "dashboard"} title="首页" onClick={() => switchNav("dashboard")}>
            <Icon name="home" className="w-4 h-4" />
          </NavIcon>
          <NavIcon active={nav === "todo"} title="待办" onClick={() => switchNav("todo")}>
            <Icon name="todo" className="w-4 h-4" />
          </NavIcon>
          <NavIcon active={nav === "trending"} title="热搜" onClick={() => switchNav("trending")}>
            <Icon name="trending" className="w-4 h-4" />
          </NavIcon>
          <NavIcon active={nav === "apps"} title="应用" onClick={() => switchNav("apps")}>
            <Icon name="apps" className="w-4 h-4" />
          </NavIcon>
          <NavIcon active={nav === "notes"} title="备忘" onClick={() => switchNav("notes")}>
            <Icon name="note" className="w-4 h-4" />
          </NavIcon>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <NavIcon title="新建文件夹" onClick={handleNewFolder} small>
            <Icon name="folder-plus" className="w-3.5 h-3.5" />
          </NavIcon>
          <NavIcon title="新建备忘" onClick={handleNewNote} small>
            <Icon name="file-plus" className="w-3.5 h-3.5" />
          </NavIcon>
          <NavIcon title="刷新" onClick={onRescan} small>
            <Icon name="refresh" className="w-3.5 h-3.5" />
          </NavIcon>
        </div>
      </div>

      {/* ============ Secondary panel ============ */}
      <div className="flex w-52 flex-col border-r border-ink-200/30 dark:border-ink-700/30">
        {/* Title + date */}
        <div className="border-b border-ink-200/30 px-4 py-4 dark:border-ink-700/30">
          <h1 className="text-[15px] font-semibold tracking-tight text-ink dark:text-ink">
            {userName}的工作台
          </h1>
          <div className="mt-3 space-y-1">
            <span className="block text-[11px] leading-tight text-ink-muted dark:text-ink-muted">
              {currentDateTime.date}
            </span>
            <div className="flex items-baseline">
              <span className="text-[24px] font-extralight tabular-nums tracking-tight text-ink dark:text-ink leading-none">
                {currentDateTime.time}
              </span>
            </div>
            {currentDateTime.lunar && (
              <div className="flex items-center gap-2 text-[10px] pt-0.5">
                <span className="rounded bg-ink-100/60 px-1.5 py-0.5 font-medium text-ink-muted dark:bg-ink-800/40 dark:text-ink-muted">
                  {currentDateTime.lunar.text}
                </span>
                <span className="text-ink-faint dark:text-ink-faint">
                  {currentDateTime.lunar.yearName} · {currentDateTime.lunar.zodiac}
                </span>
              </div>
            )}
          </div>
        </div>

        {nav === "dashboard" ? (
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <p className="label-mono mb-3">仪表盘</p>
            <p className="text-[11px] leading-relaxed text-ink-muted dark:text-ink-muted">
              天气、日历、待办、剪贴板等
            </p>
          </div>
        ) : nav === "todo" ? (
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <p className="label-mono mb-3">待办事项</p>
            <p className="text-[11px] leading-relaxed text-ink-muted dark:text-ink-muted">
              管理每日任务清单
            </p>
          </div>
        ) : nav === "trending" ? (
          <div className="flex-1 overflow-y-auto px-2.5 py-3">
            <p className="label-mono mb-2">热搜平台</p>
            <div className="space-y-0.5">
              <TrendingPlatformItem label="微博" color="#e6162d" />
              <TrendingPlatformItem label="知乎" color="#0084ff" />
              <TrendingPlatformItem label="百度" color="#2932e1" />
              <TrendingPlatformItem label="哔哩哔哩" color="#00a1d6" />
              <TrendingPlatformItem label="抖音" color="#161823" />
            </div>
            <Separator className="my-2" />
            <p className="label-mono mb-2">科技资讯</p>
            <div className="space-y-0.5">
              <TrendingPlatformItem label="36氪" color="#0061fe" />
              <TrendingPlatformItem label="IT之家" color="#d9261d" />
              <TrendingPlatformItem label="少数派" color="#d12c2c" />
              <TrendingPlatformItem label="虎嗅" color="#ff5722" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-8 shrink-0 items-center px-3">
              <span className="label-mono">{listTitle}</span>
              {nav !== "notes" && folders.length === 0 && (
                <span className="ml-auto text-[10px] text-ink-faint dark:text-ink-faint">拖入应用</span>
              )}
            </div>

            <div
              className={"flex-1 overflow-y-auto px-1.5 pb-3 transition-colors " + (dragOverFolder === "root" ? "bg-accent-soft" : "")}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (dragOverFolder !== "root") setDragOverFolder("root"); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(e, null); }}
            >
              {listItems.length === 0 && (
                <div className="mt-4 px-3 text-center text-[11px] leading-relaxed text-ink-faint dark:text-ink-faint">
                  {nav === "notes" ? "暂无备忘录\n点击左下角 + 新建" : "暂无文件夹\n点击左下角 + 新建\n或拖拽应用到此"}
                </div>
              )}
              {listItems.map((item) => (
                <SidebarNode
                  key={item.id}
                  item={item}
                  children={childrenOf(item.id)}
                  expanded={expanded}
                  onToggle={toggleFolder}
                  onDelete={handleDelete}
                  onLaunchApp={onLaunchApp}
                  onSelectNote={onSelectNote}
                  selectedNoteId={selectedNoteId}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={onSelectFolder}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onStartRename={startRename}
                  onRename={handleRename}
                  onRenameCancel={() => setRenamingId(null)}
                  onRenameChange={setRenameValue}
                  dragOverFolder={dragOverFolder}
                  setDragOverFolder={setDragOverFolder}
                  onDrop={handleDrop}
                  childrenOf={childrenOf}
                  onContextMenu={(id, x, y) => setCtxMenu({ id, x, y })}
                  hideAppItems={nav === "notes"}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <SidebarCtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          isFolder={items.find((i) => i.id === ctxMenu.id)?.itemType === "folder"}
          onOpen={() => {
            const target = items.find((i) => i.id === ctxMenu.id);
            if (target?.itemType === "folder") onSelectFolder(target.id);
            setCtxMenu(null);
          }}
          onRename={() => {
            const target = items.find((i) => i.id === ctxMenu.id);
            if (target) startRename(target.id, target.name);
            setCtxMenu(null);
          }}
          onDelete={() => { handleDelete(ctxMenu.id); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

/* ============ Trending Platform Item ============ */
function TrendingPlatformItem({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-muted dark:text-ink-muted">
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white text-[9px] font-bold" style={{ backgroundColor: color }}>
        {label.charAt(0)}
      </span>
      {label}
    </div>
  );
}

/* ============ WebView shortcut button ============ */
function WebViewShortcut({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-ink-100/40 dark:text-ink-muted dark:hover:bg-ink-800/30"
    >
      <Icon name="globe" className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
      {label}
    </button>
  );
}

/* ============ Nav icon button ============ */
function NavIcon({ children, active, onClick, title, small }: { children: React.ReactNode; active?: boolean; onClick: () => void; title: string; small?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        small ? "h-7 w-7" : "h-8 w-8",
        "relative rounded-lg",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
      )}
    >
      {children}
      {active && (
        <span className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
      )}
    </button>
  );
}

/* ============ Context menu ============ */
function SidebarCtxMenu({ x, y, isFolder, onOpen, onRename, onDelete, onClose }: {
  x: number; y: number; isFolder: boolean;
  onOpen: () => void; onRename: () => void; onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => { window.addEventListener("click", close); window.addEventListener("blur", close); }, 0);
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("click", close); window.removeEventListener("blur", close); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = 130;
  const h = isFolder ? 120 : 80;
  const ax = x + w > vw ? vw - w - 8 : x;
  const ay = y + h > vh ? vh - h - 8 : y;

  return (
    <div
      ref={ref}
      style={{ left: ax, top: ay }}
      onClick={(e) => e.stopPropagation()}
      className="animate-enter-scale fixed z-50 w-[130px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md backdrop-blur-xl"
    >
      {isFolder && (
        <button onClick={onOpen} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-popover-foreground transition-colors hover:bg-accent/10 hover:text-accent">
          <Icon name="arrow-right" className="w-3 h-3" />
          打开
        </button>
      )}
      <button onClick={onRename} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-popover-foreground transition-colors hover:bg-accent/10 hover:text-accent">
          <Icon name="pencil" className="w-3 h-3" />
          重命名
      </button>
      <button onClick={onDelete} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10">
          <Icon name="trash" className="w-3 h-3" />
          删除
      </button>
    </div>
  );
}

/* ============ Tree node ============ */
interface NodeProps {
  item: SidebarItem;
  children: SidebarItem[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onLaunchApp: (lnkPath: string) => void;
  onSelectNote: (item: SidebarItem) => void;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  renamingId: string | null;
  renameValue: string;
  onStartRename: (id: string, name: string) => void;
  onRename: (id: string) => void;
  onRenameCancel: () => void;
  onRenameChange: (v: string) => void;
  dragOverFolder: string | null;
  setDragOverFolder: (v: string | null) => void;
  onDrop: (e: React.DragEvent, folderId: string | null) => void;
  childrenOf: (parentId: string) => SidebarItem[];
  onContextMenu: (id: string, x: number, y: number) => void;
  hideAppItems?: boolean;
}

function SidebarNode(props: NodeProps) {
  const {
    item, children, expanded, onToggle, onDelete, onLaunchApp, onSelectNote,
    selectedNoteId, selectedFolderId, onSelectFolder, renamingId, renameValue,
    onStartRename, onRename, onRenameCancel, onRenameChange,
    dragOverFolder, setDragOverFolder, onDrop, childrenOf, onContextMenu, hideAppItems,
  } = props;

  const isFolder = item.itemType === "folder";
  const isNote = item.itemType === "note";
  const isAppItem = item.itemType === "app";
  const isOpen = expanded.has(item.id);
  const isRenaming = renamingId === item.id;
  const isDragOver = dragOverFolder === item.id;
  const isSelected = selectedNoteId === item.id;
  const isFolderSelected = selectedFolderId === item.id;

  const handleClick = () => {
    if (isRenaming) return;
    if (isFolder) onToggle(item.id);
    else if (isNote) onSelectNote(item);
    else if (isAppItem && item.appId) onLaunchApp(item.appId);
  };

  const handleDoubleClick = () => {
    if (isRenaming) return;
    if (isFolder) onSelectFolder(item.id);
  };

  const visibleChildren = hideAppItems ? children.filter((c) => c.itemType !== "app") : children;

  return (
    <>
      <div
        className={
          "group relative flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors " +
          (isSelected || isFolderSelected ? "bg-accent-soft " : "hover:bg-ink-100/40 dark:hover:bg-ink-800/30 ") +
          (isDragOver ? "ring-1 ring-accent/30 " : "")
        }
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(item.id, e.clientX, e.clientY); }}
        onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; if (dragOverFolder !== item.id) setDragOverFolder(item.id); } : undefined}
        onDragLeave={isFolder ? (e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) { if (dragOverFolder === item.id) setDragOverFolder(null); } } : undefined}
        onDrop={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(e, item.id); } : undefined}
        title={isFolder ? "单击展开/收起 · 双击打开 · 可拖入应用" : undefined}
      >
        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center text-ink-faint dark:text-ink-faint">
          {isFolder ? (
            isOpen ? <Icon name="folder-open" className="w-3 h-3" /> : <Icon name="folder" className="w-3 h-3" />
          ) : isNote ? (
            <Icon name="note" className="w-3 h-3" />
          ) : item.appIcon ? (
            <img src={item.appIcon} alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
          ) : (
            <Icon name="app" className="w-3 h-3" />
          )}
        </span>

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={() => onRename(item.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onRename(item.id); if (e.key === "Escape") onRenameCancel(); }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded border border-accent/40 bg-paper/80 px-1 py-0 text-[11px] text-ink outline-none dark:bg-paper-deep/80 dark:text-ink"
          />
        ) : (
          <span className={"min-w-0 flex-1 truncate text-[11px] " + (isSelected ? "font-medium text-accent dark:text-accent" : "text-ink-muted dark:text-ink-muted")}>
            {item.name}
          </span>
        )}

        {!isRenaming && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            title="删除"
            className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          >
            <Icon name="x" className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {isFolder && isOpen && (
        <div className="ml-2.5 border-l border-ink-200/30 dark:border-ink-700/30">
          {visibleChildren.length === 0 && (
            <div
              className="rounded-md px-2 py-1.5 text-center text-[10px] text-ink-faint dark:text-ink-faint transition-colors"
              style={{ background: dragOverFolder === item.id ? "var(--accent-soft)" : undefined }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOverFolder(item.id); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(e, item.id); }}
            >
              空文件夹 · 拖入应用
            </div>
          )}
          {visibleChildren.map((child) => (
            <SidebarNode key={child.id} {...props} item={child} children={childrenOf(child.id)} />
          ))}
        </div>
      )}
    </>
  );
}
