import { Icon } from "./icons";
import { useState, useEffect, useRef, useMemo } from "react";
import Fuse from "fuse.js";
import type { AppInfo, FileSearchResult, Bookmark } from "../types";
import { searchFiles, getBookmarks, openPath } from "../lib/invoke";
import { buildPluginCommands } from "../plugins/registry";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  apps: AppInfo[];
  onLaunchApp: (lnkPath: string) => void;
  onOpenWebView: (url: string, title: string) => void;
  onOpenInChrome: (url: string) => void;
  onSwitchView: (view: "apps" | "trending" | "dashboard") => void;
  onOpenSettings?: () => void;
  onOpenPluginManager?: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  section?: string;
  icon: React.ReactNode;
  action: () => void;
}

/* ── Inline SVG icons ── */

const IconSearch = () => (
  <Icon name="search" className="w-4 h-4" />
);

const IconGrid = () => (
  <Icon name="apps" className="w-4 h-4" />
);

const IconTrending = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5} fill="none">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconHome = () => (
  <Icon name="home" className="w-4 h-4" />
);

const IconSettings = () => (
  <Icon name="settings" className="w-4 h-4" />
);

const IconGlobe = () => (
  <Icon name="globe" className="w-4 h-4" />
);

const IconBookmark = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5} fill="none">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const IconApp = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5} fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </svg>
);

const IconCalc = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth={1.5} fill="none">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="8" y1="10" x2="8" y2="10.01" />
    <line x1="12" y1="10" x2="12" y2="10.01" />
    <line x1="16" y1="10" x2="16" y2="10.01" />
    <line x1="8" y1="14" x2="8" y2="14.01" />
    <line x1="12" y1="14" x2="12" y2="14.01" />
    <line x1="16" y1="14" x2="16" y2="14.01" />
    <line x1="8" y1="18" x2="8" y2="18.01" />
    <line x1="12" y1="18" x2="12" y2="18.01" />
    <line x1="16" y1="18" x2="16" y2="18.01" />
  </svg>
);

/* ── Component ── */

export default function CommandPalette(props: CommandPaletteProps) {
  const { open, onClose, apps, onLaunchApp, onOpenWebView, onOpenInChrome, onSwitchView, onOpenSettings, onOpenPluginManager } = props;
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // File-search results (async, debounced) and cached browser bookmarks
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksLoaded = useRef(false);

  // Fuzzy app search with Fuse.js (tolerant to typos / partial input)
  const fuse = useMemo(
    () => new Fuse(apps, { keys: ["name"], threshold: 0.4, ignoreLocation: true }),
    [apps],
  );

  // Reset state and auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setFileResults([]);
      requestAnimationFrame(() => inputRef.current?.focus());
      // load bookmarks once (cached across openings)
      if (!bookmarksLoaded.current) {
        getBookmarks().then((b) => {
          setBookmarks(b);
          bookmarksLoaded.current = true;
        });
      }
    }
  }, [open]);

  // Debounced filesystem search while typing
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setFileResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchFiles(query, 12).then((r) => setFileResults(r));
    }, 180);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Global keyboard listener: Escape closes the palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Build palette items based on current query ──
  const buildItems = (): PaletteItem[] => {
    const items: PaletteItem[] = [];

    if (!query.trim()) {
      // ── Quick actions ──
      items.push(
        {
          id: "q-apps",
          label: "打开应用视图",
          section: "快捷操作",
          icon: <IconGrid />,
          action: () => { onSwitchView("apps"); onClose(); },
        },
        {
          id: "q-trending",
          label: "打开热搜",
          icon: <IconTrending />,
          action: () => { onSwitchView("trending"); onClose(); },
        },
        {
          id: "q-dashboard",
          label: "返回首页",
          icon: <IconHome />,
          action: () => { onSwitchView("dashboard"); onClose(); },
        },
        {
          id: "q-settings",
          label: "打开设置",
          icon: <IconSettings />,
          action: () => { onOpenSettings?.(); onClose(); },
        },
        {
          id: "q-web",
          label: "打开网页",
          icon: <IconGlobe />,
          action: () => {
            const url = window.prompt("请输入网址");
            if (url) {
              onOpenInChrome(url.startsWith("http") ? url : `https://${url}`);
            }
            onClose();
          },
        },
      );

      // ── Plugin-contributed commands (enabled plugins) ──
      const pluginCtx = {
        openUrl: (url: string) => { onOpenInChrome(url); onClose(); },
        openWebView: (url: string, title: string) => { onOpenWebView(url, title); onClose(); },
        openInChrome: (url: string) => { onOpenInChrome(url); onClose(); },
      };
      buildPluginCommands(pluginCtx).forEach((c) => {
        items.push({
          id: `plugin-${c.id}`,
          label: c.title,
          section: c.section,
          icon: c.icon,
          action: () => c.run(),
        });
      });
      // ── Manage plugins ──
      items.push({
        id: "q-plugins",
        label: "管理插件",
        section: "更多",
        icon: <IconSettings />,
        action: () => { onOpenPluginManager?.(); onClose(); },
      });
    } else {
      const q = query.toLowerCase();

      // ── App search (fuzzy, Fuse.js) ──
      const appMatches = fuse.search(query).slice(0, 8);
      appMatches.forEach((m) => {
        const app = m.item;
        items.push({
          id: `app-${app.id}`,
          label: app.name,
          section: "应用",
          icon: <IconApp />,
          action: () => { onLaunchApp(app.lnkPath); onClose(); },
        });
      });

      // ── File search (filesystem, async debounced) ──
      fileResults.forEach((f) => {
        items.push({
          id: `file-${f.path}`,
          label: f.name,
          section: "文件",
          icon: <Icon name={f.isDir ? "folder" : "file"} className="w-4 h-4" />,
          action: () => { openPath(f.path); onClose(); },
        });
      });

      // ── Bookmarks (fuzzy filter by name / url) ──
      const bk = bookmarks
        .filter((b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
        .slice(0, 8);
      bk.forEach((b) => {
        items.push({
          id: `bm-${b.url}`,
          label: b.name,
          section: "书签",
          icon: <IconBookmark />,
          action: () => { onOpenInChrome(b.url); onClose(); },
        });
      });

      // ── Calculator ──
      const expr = query.trim();
      if (/^[\d+\-*/().%\s^]+$/.test(expr) && /[+\-*/]/.test(expr)) {
        try {
          const result = Function(`"use strict"; return (${expr})`)();
          if (typeof result === "number" && isFinite(result)) {
            items.push({
              id: "calc",
              label: `= ${result}`,
              section: "计算",
              icon: <IconCalc />,
              action: () => {},
            });
          }
        } catch {
          /* ignore invalid expressions */
        }
      }

      // ── URL detection (contains "." and no spaces) ──
      if (query.includes(".") && !query.includes(" ")) {
        const url = query.startsWith("http") ? query : `https://${query}`;
        items.push({
          id: "url",
          label: `在浏览器中打开 ${query}`,
          section: "网页",
          icon: <IconGlobe />,
          action: () => { onOpenInChrome(url); onClose(); },
        });
      }
    }

    return items;
  };

  const items = buildItems();

  // Clamp selectedIndex when items change
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Group items by section (preserve order)
  const groups = useMemo(() => {
    const out: { section: string; items: PaletteItem[] }[] = [];
    for (const it of items) {
      const sec = it.section ?? "";
      const last = out[out.length - 1];
      if (last && last.section === sec) last.items.push(it);
      else out.push({ section: sec, items: [it] });
    }
    return out;
  }, [items]);

  const currentId = items[Math.min(selectedIndex, Math.max(0, items.length - 1))]?.id ?? "";

  const onValueChange = (v: string) => {
    const idx = items.findIndex((i) => i.id === v);
    if (idx >= 0) setSelectedIndex(idx);
  };

  // ── Keyboard navigation on the input (arrows/enter handled by cmdk) ──
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Backspace" && !query) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay backdrop */}
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg">
        <div className="glass-strong command-panel rounded-2xl overflow-hidden">
          <Command
            shouldFilter={false}
            value={currentId}
            onValueChange={onValueChange}
            className="bg-transparent"
          >
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={(v) => { setQuery(v); setSelectedIndex(0); }}
              onKeyDown={handleInputKeyDown}
              placeholder="搜索应用、执行计算..."
              className="text-base"
            />
            <CommandList className="max-h-80 overflow-y-auto p-2">
              {query && items.length === 0 && (
                <div className="p-8 text-center text-sm text-ink-400">没有找到匹配结果</div>
              )}
              {groups.map((g) => (
                <CommandGroup key={g.section || "default"} heading={g.section}>
                  {g.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => item.action()}
                      className="text-[13px] text-ink-800 dark:text-ink-200"
                    >
                      <span className="shrink-0 text-ink-500">{item.icon}</span>
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      </div>
    </>
  );
}
