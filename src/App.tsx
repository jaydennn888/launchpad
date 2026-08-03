import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { AppInfo, Settings, SidebarItem } from "./types";
import { DEFAULT_SETTINGS, MAX_PINS } from "./types";
import { useSystemTheme, type ThemePref } from "./hooks/useTheme";
import {
  getSettings,
  getPinned,
  scanApps,
  launchApp,
  revealApp,
  deleteApp,
  setPinned,
  setSettings,
  getSidebarItems,
  updateSidebarItem,
  deleteSidebarItem,
  getRecent,
  openInChrome,
  setOverlay,
} from "./lib/invoke";
import { enhancedMatch } from "./lib/pinyin";
import { TitleBar } from "./components/TitleBar";
import { SearchBar } from "./components/SearchBar";
import { PinnedBar } from "./components/PinnedBar";
import { AppGrid } from "./components/AppGrid";
import { ContextMenu } from "./components/ContextMenu";
import { Sidebar } from "./components/Sidebar";
import { getPresentCategoryNames, classifyApp, categoryName } from "./lib/categories";
import PluginManager from "./plugins/PluginManager";
import { Icon } from "./components/icons";
import { LetterAvatar } from "./components/AppTile";

// 是否在 Tauri 运行时（浏览器预览中为 false，跳过原生窗口 API）
const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Lazy-loaded heavy components — only loaded when user navigates to their view
const SettingsPanel = lazy(() => import("./components/SettingsPanel").then(m => ({ default: m.SettingsPanel })));
const TrendingView = lazy(() => import("./components/TrendingView"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const TodoView = lazy(() => import("./components/TodoView"));

// Minimal loading placeholder for lazy components
const LazyFallback = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-accent" />
  </div>
);

interface Ctx {
  app: AppInfo;
  x: number;
  y: number;
}

export default function App() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  useSystemTheme(settings.theme);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("launchpad.searchHistory") || "[]"); }
    catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [launchStats, setLaunchStats] = useState<Record<string, number>>({});

  // sidebar state
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [selectedNote, setSelectedNote] = useState<SidebarItem | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  // recent apps (lnk paths, most recent first)
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // selected folder for "open folder to view apps" feature
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);
  const restoreBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // web view state
  const [webView, setWebView] = useState<{ url: string; title: string } | null>(null);

  // active view: dashboard | apps | trending | todo
  const [activeView, setActiveView] = useState<"dashboard" | "apps" | "trending" | "todo">("dashboard");

  // command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);
  // global-hotkey overlay mode: window floats on top, hides on blur
  const [overlayMode, setOverlayMode] = useState(false);
  const overlayModeRef = useRef(false);

  // ---- mount: load data ----
  useEffect(() => {
    (async () => {
      try {
        // Ensure window has adequate size on first launch
        try {
          const win = getCurrentWindow();
          const size = await win.outerSize();
          if (size.width < 1000 || size.height < 650) {
            await win.setSize(new PhysicalSize(1150, 700));
            await win.center();
          }
        } catch {
          /* ignore window resize errors */
        }
        try {
          const raw = localStorage.getItem("launchpad.launchStats");
          if (raw) setLaunchStats(JSON.parse(raw));
        } catch {
          /* ignore */
        }
        const [s, p, a, sb, r] = await Promise.all([
          getSettings(),
          getPinned(),
          scanApps(false),
          getSidebarItems(),
          getRecent(),
        ]);
        setSettingsState(s);
        setPinnedIds(p);
        setApps(a);
        setSidebarItems(sb);
        setRecentIds(r);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- reflect always-on-top setting onto the window ----
  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop).catch(() => {});
  }, [settings.alwaysOnTop]);

  const restoreFromEdge = useEdgeSnap(settings.edgeSnap, settings.edgeAutoHide);

  // ---- plugin manager modal ----
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);

  // ---- toast auto-dismiss ----
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- when a note is selected, sync the draft ----
  useEffect(() => {
    setNoteDraft(selectedNote?.content ?? "");
  }, [selectedNote?.id]);

  const refreshSidebar = useCallback(async () => {
    try {
      setSidebarItems(await getSidebarItems());
    } catch {
      /* ignore */
    }
  }, []);

  const sortedApps = useMemo(() => {
    if (!settings.smartSort) return apps;
    const pinnedRank = new Map(pinnedIds.map((id, index) => [id, index]));
    const recentRank = new Map(recentIds.map((id, index) => [id, index]));
    return [...apps].sort((a, b) => {
      const pa = pinnedRank.has(a.id) ? 10000 - (pinnedRank.get(a.id) ?? 0) : 0;
      const pb = pinnedRank.has(b.id) ? 10000 - (pinnedRank.get(b.id) ?? 0) : 0;
      const ua = launchStats[a.id] ?? 0;
      const ub = launchStats[b.id] ?? 0;
      const ra = recentRank.has(a.id) ? 100 - (recentRank.get(a.id) ?? 0) : 0;
      const rb = recentRank.has(b.id) ? 100 - (recentRank.get(b.id) ?? 0) : 0;
      const scoreA = pa + ua * 12 + ra;
      const scoreB = pb + ub * 12 + rb;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [apps, pinnedIds, recentIds, launchStats, settings.smartSort]);

  const filtered = useMemo(() => {
    let list = sortedApps;
    // Category filter
    if (activeCategory) {
      list = list.filter((a) => categoryName(classifyApp(a)) === activeCategory);
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) => enhancedMatch(a.name, q) || enhancedMatch(a.sortKey, q)
    );
  }, [sortedApps, query, activeCategory]);

  // Map recent lnk-path ids to AppInfo objects (most recent first)
  const recentApps = useMemo(() => {
    return recentIds
      .map((id) => apps.find((a) => a.id === id))
      .filter((a): a is AppInfo => Boolean(a));
  }, [recentIds, apps]);

  // Apps inside the currently selected sidebar folder
  const folderApps = useMemo(() => {
    if (!selectedFolderId) return [];
    const folderItem = sidebarItems.find((i) => i.id === selectedFolderId);
    if (!folderItem) return [];
    const folderName = folderItem.name;
    // Get app items directly inside this folder
    const childApps = sidebarItems
      .filter((i) => i.itemType === "app" && i.parentId === selectedFolderId && i.appId)
      .map((i) => sortedApps.find((a) => a.id === i.appId))
      .filter((a): a is AppInfo => Boolean(a));
    return childApps;
  }, [selectedFolderId, sidebarItems, sortedApps]);

  const selectedFolder = useMemo(
    () => sidebarItems.find((i) => i.id === selectedFolderId) ?? null,
    [sidebarItems, selectedFolderId],
  );

  const togglePin = async (app: AppInfo) => {
    let next: string[];
    if (pinnedIds.includes(app.id)) {
      next = pinnedIds.filter((x) => x !== app.id);
    } else {
      if (pinnedIds.length >= MAX_PINS) {
        setToast(`最多只能置顶 ${MAX_PINS} 个应用`);
        return;
      }
      next = [...pinnedIds, app.id];
    }
    setPinnedIds(next);
    try {
      await setPinned(next);
    } catch {
      setPinnedIds(pinnedIds); // rollback
      setToast("保存失败");
    }
  };

  const launch = async (app: AppInfo) => {
    try {
      await launchApp(app.lnkPath);
      // optimistic recent update (most recent first, dedup, max 8)
      setRecentIds((prev) => {
        const next = [app.id, ...prev.filter((x) => x !== app.id)];
        return next.slice(0, 8);
      });
      setLaunchStats((prev) => {
        const next = { ...prev, [app.id]: (prev[app.id] ?? 0) + 1 };
        localStorage.setItem("launchpad.launchStats", JSON.stringify(next));
        return next;
      });
    } catch {
      setToast(`无法启动 ${app.name}`);
    }
  };

  const reveal = async (app: AppInfo) => {
    try {
      await revealApp(app.lnkPath);
    } catch {
      setToast("无法打开文件位置");
    }
  };

  const removeApp = async (app: AppInfo) => {
    try {
      await deleteApp(app.lnkPath, app.targetPath || undefined);
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      if (pinnedIds.includes(app.id)) {
        const next = pinnedIds.filter((x) => x !== app.id);
        setPinnedIds(next);
        await setPinned(next);
      }
      setToast(`已删除 ${app.name}（重新扫描不会再出现）`);
    } catch {
      setToast("删除失败");
    }
  };

  const launchByPath = useCallback(
    async (lnkPath: string) => {
      try {
        await launchApp(lnkPath);
      } catch {
        setToast("无法启动");
      }
    },
    []
  );

  const saveNote = useCallback(
    async (content: string) => {
      if (!selectedNote) return;
      try {
        await updateSidebarItem(selectedNote.id, undefined, content);
        setSidebarItems((prev) =>
          prev.map((i) =>
            i.id === selectedNote.id ? { ...i, content } : i
          )
        );
      } catch {
        setToast("备忘录保存失败");
      }
    },
    [selectedNote]
  );

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → open command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen) {
          setPaletteOpen(false);
        } else {
          setPaletteOpen(true);
        }
      }
      // Esc → clear search / close context menu / close note / close webview / close palette
      if (e.key === "Escape") {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (webView) { setWebView(null); return; }
        if (ctx) setCtx(null);
        else if (selectedNote) {
          saveNote(noteDraft);
          setSelectedNote(null);
        } else if (query) {
          setQuery("");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, selectedNote, query, noteDraft, saveNote, paletteOpen]);

  // ---- global hotkey overlay (Alt+Space) ----
  // 关闭命令面板：若处于浮层模式，则退出浮层并隐藏窗口（Raycast 式收起）
  const exitOverlay = useCallback(() => {
    setPaletteOpen(false);
    if (overlayModeRef.current) {
      setOverlayMode(false);
      if (IS_TAURI) {
        setOverlay(false);
        getCurrentWindow().setAlwaysOnTop(false).catch(() => {});
        getCurrentWindow().hide().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!IS_TAURI) return;
    const win = getCurrentWindow();
    const unlistenP = listen<boolean>("toggle-overlay", (e) => {
      setOverlayMode(e.payload);
      setPaletteOpen(e.payload);
    });
    const unlistenBlur = win.listen("blur", () => {
      if (overlayModeRef.current) exitOverlay();
    });
    return () => {
      unlistenP.then((u: () => void) => u()).catch(() => {});
      unlistenBlur.then((u: () => void) => u()).catch(() => {});
    };
  }, [exitOverlay]);

  useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  const rescan = async () => {
    setLoading(true);
    setError(null);
    setSettingsOpen(false);
    try {
      const a = await scanApps(true);
      setApps(a);
      setToast(`已扫描 ${a.length} 个应用`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = (s: Settings) => {
    setSettingsState(s);
    setSettings(s).catch(() => setToast("设置保存失败"));
  };

  // Quick theme switch in the title bar: system -> light -> dark -> system
  const cycleTheme = () => {
    const order: ThemePref[] = ["system", "light", "dark"];
    const idx = order.indexOf((settings.theme as ThemePref) || "system");
    const next = order[(idx + 1) % order.length];
    updateSettings({ ...settings, theme: next });
  };

  const compactApps = useMemo(() => {
    return pinnedIds
      .slice(0, 8)
      .map((id) => apps.find((a) => a.id === id))
      .filter((a): a is AppInfo => Boolean(a));
  }, [pinnedIds, apps]);

  const enterCompactMode = useCallback(async () => {
    if (!settings.compactOnMinimize) {
      getCurrentWindow().minimize().catch(() => {});
      return;
    }

    try {
      const win = getCurrentWindow();
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      restoreBoundsRef.current = {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      };

      const count = Math.max(1, Math.min(compactApps.length, 8));
      const horizontal = settings.compactOrientation !== "vertical";
      const nextWidth = horizontal ? Math.max(128, count * 58 + 64) : 82;
      const nextHeight = horizontal ? 82 : Math.max(128, count * 58 + 64);

      setCompactMode(true);
      await win.setSize(new PhysicalSize(nextWidth, nextHeight));
      await win.setAlwaysOnTop(true);
    } catch {
      getCurrentWindow().minimize().catch(() => {});
    }
  }, [compactApps.length, settings.compactOnMinimize, settings.compactOrientation]);

  const exitCompactMode = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const bounds = restoreBoundsRef.current;
      setCompactMode(false);
      if (bounds) {
        await win.setSize(new PhysicalSize(bounds.width, bounds.height));
        await win.setPosition(new PhysicalPosition(bounds.x, bounds.y));
      } else {
        await win.setSize(new PhysicalSize(900, 640));
      }
      await win.setAlwaysOnTop(settings.alwaysOnTop);
    } catch {
      setCompactMode(false);
    }
  }, [settings.alwaysOnTop]);

  const showQuery = query.trim().length > 0;

  return (
    <div
      onMouseEnter={restoreFromEdge}
      className="relative flex h-full flex-col overflow-hidden rounded-xl border border-ink-200/25 bg-white/90 text-ink-900 shadow-2xl shadow-black/[0.06] backdrop-blur-2xl dark:border-ink-700/25 dark:bg-ink-900/90 dark:text-ink-50"
    >
      {/* 动态极光背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="aurora aurora-1" />
        <div className="aurora aurora-2" />
      </div>
      {compactMode ? (
        <CompactDock
          apps={compactApps}
          grayscale={settings.grayscaleIcons}
          orientation={settings.compactOrientation}
          onLaunch={launch}
          onExpand={exitCompactMode}
        />
      ) : (
        <>
      <TitleBar
        theme={settings.theme as ThemePref}
        onCycleTheme={cycleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onMinimize={enterCompactMode}
      />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — shrink-0 prevents the sidebar from being squeezed */}
        <div className="shrink-0">
          <Sidebar
          items={sidebarItems}
          onItemsChange={refreshSidebar}
          onLaunchApp={launchByPath}
          onSelectNote={(item) => setSelectedNote(item)}
          selectedNoteId={selectedNote?.id ?? null}
          onToast={setToast}
          selectedFolderId={selectedFolderId}
          onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setQuery("");
            setActiveView("apps");
          }}
          onShowAllApps={() => {
            setSelectedFolderId(null);
            setActiveView("apps");
          }}
          onOpenWebView={(url, title) => {
            setWebView({ url, title });
          }}
          onOpenInChrome={(url) => {
            openInChrome(url).catch(() => setToast("无法打开 Chrome"));
          }}
          onRescan={rescan}
          activeView={activeView}
          onSwitchView={(v) => setActiveView(v as "dashboard" | "apps" | "trending" | "todo")}
          userName={settings.userName}
        />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {activeView === "dashboard" ? (
            <Suspense fallback={<LazyFallback />}>
              <div className="flex-1 overflow-y-auto">
                <Dashboard userName={settings.userName} />
              </div>
            </Suspense>
          ) : activeView === "trending" ? (
            <Suspense fallback={<LazyFallback />}>
              <div className="flex-1 overflow-hidden">
                <TrendingView />
              </div>
            </Suspense>
          ) : activeView === "todo" ? (
            <Suspense fallback={<LazyFallback />}>
              <div className="flex-1 overflow-hidden">
                <TodoView />
              </div>
            </Suspense>
          ) : (
            <>
              <SearchBar
                value={query}
                onChange={(v) => {
                  if (v.trim() && !query.trim()) {
                    // entering search mode: save current category to restore later
                  }
                  setQuery(v);
                  if (v.trim()) {
                    setActiveCategory(null);
                    setSearchHistory((prev) => {
                      const next = [v.trim(), ...prev.filter((h) => h !== v.trim())].slice(0, 10);
                      localStorage.setItem("launchpad.searchHistory", JSON.stringify(next));
                      return next;
                    });
                  }
                }}
                resultCount={filtered.length}
                totalCount={apps.length}
                history={searchHistory}
                onClearHistory={() => {
                  setSearchHistory([]);
                  localStorage.removeItem("launchpad.searchHistory");
                }}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                categories={getPresentCategoryNames(apps)}
              />

              {!selectedFolderId && !showQuery && !loading && !error && (
                <WorkbenchOverview
                  appCount={apps.length}
                  pinnedCount={pinnedIds.length}
                  recentCount={recentApps.length}
                  folderCount={sidebarItems.filter((i) => i.itemType === "folder").length}
                  onFocusSearch={() => {
                    const input = document.querySelector<HTMLInputElement>(
                      'input[placeholder^="搜索应用"]',
                    );
                    input?.focus();
                    input?.select();
                  }}
                />
              )}

              <div className="relative flex-1 overflow-y-auto">
                {loading ? (
                  <LoadingState />
                ) : error ? (
                  <ErrorState error={error} onRetry={rescan} />
                ) : selectedFolderId ? (
                  <FolderView
                    folder={selectedFolder}
                    apps={folderApps}
                    pinnedIds={pinnedIds}
                    grayscale={settings.grayscaleIcons}
                    onBack={() => setSelectedFolderId(null)}
                    onLaunch={launch}
                    onTogglePin={togglePin}
                    onContext={(app, x, y) => setCtx({ app, x, y })}
                    onRemove={(appId) => {
                      // remove the app entry from this folder
                      const entry = sidebarItems.find(
                        (i) => i.itemType === "app" && i.parentId === selectedFolderId && i.appId === appId,
                      );
                      if (entry) {
                        deleteSidebarItem(entry.id).then(refreshSidebar);
                      }
                    }}
                  />
                ) : (
                  <div className="animate-fade pb-2">
                    {!showQuery && (
                      <PinnedBar
                        apps={apps}
                        pinnedIds={pinnedIds}
                        grayscale={settings.grayscaleIcons}
                        onLaunch={launch}
                        onTogglePin={togglePin}
                        onContext={(app, x, y) => setCtx({ app, x, y })}
                      />
                    )}
                    {!showQuery && recentApps.length > 0 && (
                      <RecentBar
                        apps={recentApps}
                        grayscale={settings.grayscaleIcons}
                        onLaunch={launch}
                        onContext={(app, x, y) => setCtx({ app, x, y })}
                      />
                    )}
                    <AppGrid
                      apps={filtered}
                      pinnedIds={pinnedIds}
                      grayscale={settings.grayscaleIcons}
                      query={query.trim()}
                      activeCategory={activeCategory}
                      onLaunch={launch}
                      onTogglePin={togglePin}
                      onContext={(app, x, y) => setCtx({ app, x, y })}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Note editor slide-over */}
      {selectedNote && (
        <NoteEditor
          note={selectedNote}
          value={noteDraft}
          onChange={setNoteDraft}
          onClose={() => {
            saveNote(noteDraft);
            setSelectedNote(null);
          }}
          onSave={() => saveNote(noteDraft)}
        />
      )}

      <Suspense fallback={null}>
        <SettingsPanel
          open={settingsOpen}
          settings={settings}
          onChange={updateSettings}
          onRescan={rescan}
          onClose={() => setSettingsOpen(false)}
        />
      </Suspense>

      {ctx && (
        <ContextMenu
          app={ctx.app}
          pinned={pinnedIds.includes(ctx.app.id)}
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          onLaunch={launch}
          onTogglePin={togglePin}
          onReveal={reveal}
          onDelete={removeApp}
        />
      )}

      {toast && (
        <div className="animate-pop fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-ink-200/40 bg-white/90 px-4 py-2.5 text-[12px] font-medium text-ink-800 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-ink-700/40 dark:bg-ink-900/90 dark:text-ink-100">
          {toast}
        </div>
      )}

      {/* WebView overlay */}
      {webView && (
        <WebViewOverlay
          url={webView.url}
          title={webView.title}
          onClose={() => setWebView(null)}
        />
      )}

      {/* Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette
        open={paletteOpen}
        onClose={exitOverlay}
        apps={apps}
        onLaunchApp={launchByPath}
        onOpenWebView={(url, title) => setWebView({ url, title })}
        onOpenInChrome={(url) => openInChrome(url).catch(() => setToast("无法打开 Chrome"))}
        onSwitchView={(v) => { setActiveView(v); setPaletteOpen(false); }}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setPaletteOpen(false);
          if (IS_TAURI) {
            setOverlayMode(false);
            setOverlay(false);
            getCurrentWindow().setAlwaysOnTop(false).catch(() => {});
          }
        }}
        onOpenPluginManager={() => setPluginManagerOpen(true)}
      />
      </Suspense>
      <PluginManager open={pluginManagerOpen} onClose={() => setPluginManagerOpen(false)} />
        </>
      )}
    </div>
  );
}

function CompactDock({
  apps,
  grayscale,
  orientation,
  onLaunch,
  onExpand,
}: {
  apps: AppInfo[];
  grayscale: boolean;
  orientation: "horizontal" | "vertical";
  onLaunch: (app: AppInfo) => void;
  onExpand: () => void;
}) {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const vertical = orientation === "vertical";

  return (
    <div
      data-tauri-drag-region
      className={
        "flex h-full w-full items-center gap-2 border border-ink-200/60 bg-white/75 p-2 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-ink-700/60 dark:bg-ink-900/75 " +
        (vertical ? "flex-col" : "flex-row")
      }
      title="拖动可移动 · 点击右上角展开"
    >
      <button
        data-no-drag
        onClick={onExpand}
        title="展开工作台"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent transition hover:bg-accent/20 dark:text-accent"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5" />
        </svg>
      </button>

      <div
        data-tauri-drag-region
        className={"flex min-w-0 flex-1 items-center gap-1.5 " + (vertical ? "flex-col" : "flex-row")}
      >
        {apps.length === 0 ? (
          <div className="px-2 text-center text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
            先置顶应用
          </div>
        ) : (
          apps.map((app) => {
            const failed = imgErrors.has(app.id);
            return (
              <button
                key={app.id}
                data-no-drag
                onClick={() => onLaunch(app)}
                title={app.name}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition hover:bg-ink-100/80 active:scale-95 dark:hover:bg-ink-800/70"
              >
                {app.icon && !failed ? (
                  <img
                    src={app.icon}
                    alt=""
                    draggable={false}
                    onError={() =>
                      setImgErrors((prev) => new Set(prev).add(app.id))
                    }
                    className="h-8 w-8 object-contain drop-shadow-sm"
                    style={{ filter: grayscale ? "grayscale(1) contrast(1.05)" : undefined }}
                  />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-[22%] bg-accent text-[14px] font-semibold text-white">
                    {(app.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function useEdgeSnap(enabled: boolean, autoHide: boolean) {
  const timerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const snappingRef = useRef(false);
  const hiddenRef = useRef<{
    edge: "left" | "right" | "top" | "bottom";
    x: number;
    y: number;
  } | null>(null);

  const restoreFromEdge = useCallback(async () => {
    const hidden = hiddenRef.current;
    if (!hidden) return;
    try {
      snappingRef.current = true;
      hiddenRef.current = null;
      await getCurrentWindow().setPosition(new PhysicalPosition(hidden.x, hidden.y));
      window.setTimeout(() => {
        snappingRef.current = false;
      }, 160);
    } catch {
      snappingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const snapToNearestEdge = async () => {
      if (!enabled || snappingRef.current) return;

      try {
        const maximized = await win.isMaximized();
        if (maximized) return;

        const [monitor, pos, size] = await Promise.all([
          currentMonitor(),
          win.outerPosition(),
          win.outerSize(),
        ]);
        if (!monitor) return;

        const work = monitor.workArea;
        const left = work.position.x;
        const top = work.position.y;
        const right = work.position.x + work.size.width;
        const bottom = work.position.y + work.size.height;
        const threshold = 26;

        let nextX = pos.x;
        let nextY = pos.y;
        let edge: "left" | "right" | "top" | "bottom" | null = null;

        if (Math.abs(pos.x - left) <= threshold) {
          nextX = left;
          edge = "left";
        } else if (Math.abs(pos.x + size.width - right) <= threshold) {
          nextX = right - size.width;
          edge = "right";
        }

        if (Math.abs(pos.y - top) <= threshold) {
          nextY = top;
          edge = "top";
        } else if (Math.abs(pos.y + size.height - bottom) <= threshold) {
          nextY = bottom - size.height;
          edge = "bottom";
        }

        if (nextX !== pos.x || nextY !== pos.y) {
          snappingRef.current = true;
          await win.setPosition(new PhysicalPosition(nextX, nextY));
          hiddenRef.current = null;
          window.setTimeout(() => {
            snappingRef.current = false;
          }, 120);

          if (autoHide && edge) {
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(async () => {
              try {
                const latestSize = await win.outerSize();
                const strip = 8;
                let hiddenX = nextX;
                let hiddenY = nextY;
                if (edge === "left") hiddenX = left - latestSize.width + strip;
                if (edge === "right") hiddenX = right - strip;
                if (edge === "top") hiddenY = top - latestSize.height + strip;
                if (edge === "bottom") hiddenY = bottom - strip;

                hiddenRef.current = { edge, x: nextX, y: nextY };
                snappingRef.current = true;
                await win.setPosition(new PhysicalPosition(hiddenX, hiddenY));
                window.setTimeout(() => {
                  snappingRef.current = false;
                }, 160);
              } catch {
                hiddenRef.current = null;
                snappingRef.current = false;
              }
            }, 900);
          }
        }
      } catch {
        snappingRef.current = false;
      }
    };

    win
      .onMoved(() => {
        if (!enabled) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(snapToNearestEdge, 160);
      })
      .then((u) => (unlisten = u))
      .catch(() => {});

    return () => {
      unlisten?.();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [enabled, autoHide]);

  return restoreFromEdge;
}

function WorkbenchOverview({
  appCount,
  pinnedCount,
  recentCount,
  folderCount,
  onFocusSearch,
}: {
  appCount: number;
  pinnedCount: number;
  recentCount: number;
  folderCount: number;
  onFocusSearch: () => void;
}) {
  return (
    <div className="px-6 pb-2">
      <div className="flex items-center gap-3">
        <StatBadge label="应用" value={appCount} />
        <div className="h-4 w-px bg-ink-200/40 dark:bg-ink-700/40" />
        <StatBadge label="常用" value={pinnedCount} />
        <div className="h-4 w-px bg-ink-200/40 dark:bg-ink-700/40" />
        <StatBadge label="最近" value={recentCount} />
        <div className="h-4 w-px bg-ink-200/40 dark:bg-ink-700/40" />
        <StatBadge label="文件夹" value={folderCount} />
        <div className="ml-auto">
          <button
            onClick={onFocusSearch}
            className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-all hover:bg-accent/15 dark:text-accent"
            title="Ctrl + K 搜索"
          >
            <Icon name="search" className="w-3 h-3" />
            搜索
            <span className="rounded border border-accent/20 px-1 text-[10px]">Ctrl K</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[11px] text-ink-400 dark:text-ink-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-ink-800 dark:text-ink-200">{value}</span>
    </div>
  );
}

function NoteEditor({
  note,
  value,
  onChange,
  onClose,
  onSave,
}: {
  note: SidebarItem;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      <div
        className="h-full w-full bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-fade flex h-full w-80 flex-col border-l border-ink-200/40 bg-white/90 backdrop-blur-2xl dark:border-ink-700/40 dark:bg-ink-900/90">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-ink-200/40 px-3 dark:border-ink-700/40">
          <span className="truncate text-[12px] font-medium text-ink-700 dark:text-ink-200">
            {note.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onSave}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 dark:text-accent"
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-500 hover:bg-ink-100/80 dark:hover:bg-ink-800/60"
              title="关闭"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        </div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="开始记录…"
          className="flex-1 resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 dark:text-ink-100 dark:placeholder:text-ink-600"
        />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4 text-ink-400 dark:text-ink-500">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-ink-200 border-t-accent dark:border-ink-700 dark:border-t-accent" />
        </div>
        <span className="text-[12px] font-medium">正在扫描已安装应用…</span>
      </div>
    </div>
  );
}

function FolderView({
  folder,
  apps,
  pinnedIds,
  grayscale,
  onBack,
  onLaunch,
  onTogglePin,
  onContext,
  onRemove,
}: {
  folder: SidebarItem | null;
  apps: AppInfo[];
  pinnedIds: string[];
  grayscale: boolean;
  onBack: () => void;
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
  onRemove: (appId: string) => void;
}) {
  const set = new Set(pinnedIds);
  return (
    <div className="animate-fade pb-6">
      <div className="flex items-center gap-2 px-6 pt-3 pb-3">
        <button
          onClick={onBack}
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100/80 dark:text-ink-400 dark:hover:bg-ink-800/60"
          title="返回"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
        </button>
        <Icon name="folder" className="w-[18px] h-[18px] text-accent" />
        <span className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">
          {folder?.name ?? "文件夹"}
        </span>
        <span className="text-[11px] text-ink-400 dark:text-ink-500">
          · {apps.length} 个应用
        </span>
      </div>
      <div className="px-6">
        {apps.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center text-[13px] text-ink-400 dark:text-ink-500">
            <div className="mb-2">
              <Icon name="folder" className="mx-auto w-10 h-10 opacity-40" />
            </div>
            这个文件夹还是空的
            <div className="mt-1 text-[11px]">从右侧应用网格拖拽应用到左侧文件夹</div>
          </div>
        ) : (
          <div
            className="grid justify-items-center gap-x-3 gap-y-5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
            }}
          >
            {apps.map((app) => (
              <FolderAppTile
                key={app.id}
                app={app}
                pinned={set.has(app.id)}
                grayscale={grayscale}
                onLaunch={onLaunch}
                onTogglePin={onTogglePin}
                onContext={onContext}
                onRemove={() => onRemove(app.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FolderAppTile({
  app,
  pinned,
  grayscale,
  onLaunch,
  onTogglePin,
  onContext,
  onRemove,
}: {
  app: AppInfo;
  pinned: boolean;
  grayscale: boolean;
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
  onRemove: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      className="tile group relative flex flex-col items-center gap-2 rounded-2xl px-1 py-2.5 w-[100px] text-center cursor-pointer appearance-none border-0 bg-transparent p-0 transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-100/40 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:bg-ink-800/30 dark:hover:shadow-black/20"
      title={app.name}
      onClick={() => onLaunch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(app, e.clientX, e.clientY);
      }}
    >
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="从文件夹移除"
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-ink-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-ink-200/80 dark:hover:bg-ink-700/80"
      >
        <Icon name="x" className="w-2.5 h-2.5" />
      </span>
      <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-[20%] bg-transparent">
        {app.icon && !imgError ? (
          <img
            src={app.icon}
            alt=""
            draggable={false}
            onError={() => setImgError(true)}
            className="h-full w-full object-contain"
            style={{ filter: grayscale ? "grayscale(1) contrast(1.05)" : undefined }}
          />
        ) : (
          <LetterAvatar name={app.name} className="h-full w-full" />
        )}
      </div>
      <span className="line-clamp-2 max-w-full break-words leading-[1.3] tracking-[0.005em] text-ink-muted dark:text-ink-muted font-medium text-[12px]">
        {app.name}
      </span>
    </button>
  );
}

function RecentBar({
  apps,
  grayscale,
  onLaunch,
  onContext,
}: {
  apps: AppInfo[];
  grayscale: boolean;
  onLaunch: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
}) {
  if (apps.length === 0) return null;
  return (
    <div className="px-6 pt-1 pb-4">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400 dark:text-ink-500">
          最近使用 · {apps.length}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-ink-200/40 to-transparent dark:from-ink-700/40" />
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {apps.map((app) => (
          <RecentTile
            key={app.id}
            app={app}
            grayscale={grayscale}
            onLaunch={onLaunch}
            onContext={onContext}
          />
        ))}
      </div>
    </div>
  );
}

function RecentTile({
  app,
  grayscale,
  onLaunch,
  onContext,
}: {
  app: AppInfo;
  grayscale: boolean;
  onLaunch: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
}) {
  return (
    <button
      className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-white/50 dark:hover:bg-white/5"
      title={app.name}
      onClick={() => onLaunch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(app, e.clientX, e.clientY);
      }}
    >
      <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[22%] bg-gradient-to-br from-white/40 to-white/10 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
        {app.icon ? (
          <img
            src={app.icon}
            alt=""
            draggable={false}
            className="h-[80%] w-[80%] object-contain"
            style={{ filter: grayscale ? "grayscale(1)" : undefined }}
          />
        ) : null}
      </div>
      <span className="max-w-[96px] truncate text-[12px] text-ink-700 dark:text-ink-200">
        {app.name}
      </span>
    </button>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-500">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div className="mb-1 text-[14px] font-semibold text-ink-700 dark:text-ink-200">
          扫描失败
        </div>
        <div className="mb-5 break-words text-[12px] leading-relaxed text-ink-400 dark:text-ink-500">
          {error}
        </div>
        <button
          onClick={onRetry}
          className="rounded-xl bg-ink-900 px-5 py-2.5 text-[12px] font-medium text-white shadow-lg shadow-black/10 transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-200"
        >
          重试
        </button>
      </div>
    </div>
  );
}

function WebViewOverlay({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Timeout: if iframe doesn't signal load within 10s, show warning
    timerRef.current = window.setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url]);

  const handleLoad = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(false);
  };

  const handleError = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(false);
    setError("网页加载失败，可能由于网站限制无法在此嵌入显示。");
  };

  return (
    <div className="animate-fade absolute inset-0 z-30 flex flex-col bg-white dark:bg-ink-900">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-ink-200/40 px-3 dark:border-ink-700/40">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100/80 dark:text-ink-400 dark:hover:bg-ink-800/60"
            title="关闭"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <span className="text-[13px] font-medium text-ink-800 dark:text-ink-100">
            {title}
          </span>
          {loading && (
            <span className="ml-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-200 border-t-accent dark:border-ink-700 dark:border-t-accent" />
          )}
        </div>
        <button
          onClick={() => openInChrome(url).catch(() => {})}
          title="在 Chrome 中打开"
          className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-100/80 dark:text-ink-400 dark:hover:bg-ink-800/60"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 top-10 z-10 grid place-items-center bg-white/80 backdrop-blur-sm dark:bg-ink-900/80">
          <div className="flex flex-col items-center gap-3 text-ink-400 dark:text-ink-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-accent dark:border-ink-700 dark:border-t-accent" />
            <span className="text-[12px]">正在加载 {title}…</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 top-10 z-10 grid place-items-center bg-white/90 backdrop-blur-sm dark:bg-ink-900/90">
          <div className="max-w-sm px-6 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="mb-1 text-[14px] font-medium text-ink-700 dark:text-ink-200">{error}</div>
            <p className="mb-4 text-[12px] text-ink-400 dark:text-ink-500">
              部分网站（如小红书、微博）限制了嵌入显示，建议在 Chrome 中打开获得完整体验。
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => openInChrome(url).catch(() => {})}
                className="rounded-xl bg-ink-900 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-200"
              >
                在 Chrome 中打开
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-ink-200/60 px-4 py-2 text-[12px] font-medium text-ink-600 transition hover:bg-ink-100/60 dark:border-ink-700/50 dark:text-ink-300 dark:hover:bg-ink-800/40"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Iframe - removed sandbox to allow login, QR codes, and full web functionality */}
      <iframe
        src={url}
        className="flex-1 border-0"
        title={title}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
