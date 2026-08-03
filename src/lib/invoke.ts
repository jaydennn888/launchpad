import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  Settings,
  SidebarItem,
  SidebarItemType,
  SystemStats,
  RecentFileInfo,
  ClipboardEntry,
  ColorInfo,
  NetworkSpeed,
  FileSearchResult,
  Bookmark,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";

/**
 * Inside the Tauri webview, `window.__TAURI_INTERNALS__` exists.
 * In a plain browser (e.g. `npm run dev` / `vite preview`) it does not, so we
 * serve mock data to keep the whole UI rendered and interactive for preview —
 * without touching real Tauri behaviour on the desktop build.
 */
const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------- mock data for browser preview ----------
const mockApp = (name: string): AppInfo => {
  const id = "mock://" + name;
  return {
    id,
    name,
    lnkPath: id,
    targetPath: "",
    icon: null,
    sortKey: name.toLowerCase(),
  };
};

const MOCK_APPS: AppInfo[] = [
  mockApp("文件资源管理器"),
  mockApp("微信"),
  mockApp("钉钉"),
  mockApp("网易云音乐"),
  mockApp("Microsoft Edge"),
  mockApp("Visual Studio Code"),
  mockApp("腾讯会议"),
  mockApp("截图工具"),
  mockApp("计算器"),
  mockApp("记事本"),
  mockApp("PowerShell"),
  mockApp("设置"),
];

const MOCK_SIDEBAR: SidebarItem[] = [
  {
    id: "mock-folder-1",
    itemType: "folder",
    name: "开发工具",
    parentId: null,
    content: null,
    appId: null,
    appName: null,
    appIcon: null,
    createdAt: Date.now(),
  },
  {
    id: "mock-note-1",
    itemType: "note",
    name: "购物清单",
    parentId: null,
    content: "牛奶\n鸡蛋\n面包",
    appId: null,
    appName: null,
    appIcon: null,
    createdAt: Date.now(),
  },
  {
    id: "mock-si-1",
    itemType: "app",
    name: "微信",
    parentId: "mock-folder-1",
    content: null,
    appId: "mock://微信",
    appName: "微信",
    appIcon: null,
    createdAt: Date.now(),
  },
  {
    id: "mock-si-2",
    itemType: "app",
    name: "Visual Studio Code",
    parentId: "mock-folder-1",
    content: null,
    appId: "mock://Visual Studio Code",
    appName: "Visual Studio Code",
    appIcon: null,
    createdAt: Date.now(),
  },
];

const MOCK_STATS: SystemStats = {
  cpuUsage: 23,
  memoryUsed: 6.4,
  memoryTotal: 16,
  diskUsed: 182,
  diskTotal: 512,
  diskPercent: 35,
};

const MOCK_RECENT: RecentFileInfo[] = [
  {
    name: "需求文档.docx",
    path: "C:\\Users\\user\\Documents\\需求文档.docx",
    modified: "2026-07-31",
    icon: null,
  },
  {
    name: "周报.xlsx",
    path: "C:\\Users\\user\\Documents\\周报.xlsx",
    modified: "2026-07-30",
    icon: null,
  },
  {
    name: "设计稿.fig",
    path: "C:\\Users\\user\\Documents\\设计稿.fig",
    modified: "2026-07-29",
    icon: null,
  },
];

const MOCK_CLIP: ClipboardEntry[] = [
  { id: "c1", text: "https://launchpad.app", timestamp: Date.now() - 60000 },
  { id: "c2", text: "待办：回复客户邮件", timestamp: Date.now() - 3600000 },
];

const MOCK_NETWORK: NetworkSpeed = { uploadKbps: 120, downloadKbps: 850 };

const MOCK_COLOR: ColorInfo = { hex: "#0D9488", rgb: "13,148,136", x: 0, y: 0 };

const resolve = <T>(value: T): Promise<T> => Promise.resolve(value);

// ---------- app scanning ----------
export function scanApps(force: boolean): Promise<AppInfo[]> {
  if (IS_TAURI) return invoke<AppInfo[]>("scan_apps", { force });
  return resolve(MOCK_APPS);
}

export function launchApp(lnkPath: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("launch_app", { lnkPath });
  return resolve(undefined);
}

export function getRecent(): Promise<string[]> {
  if (IS_TAURI) return invoke<string[]>("get_recent");
  return resolve([]);
}

export function revealApp(lnkPath: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("reveal_app", { lnkPath });
  return resolve(undefined);
}

export function deleteApp(lnkPath: string, targetPath?: string): Promise<void> {
  if (IS_TAURI)
    return invoke<void>("delete_app", { lnkPath, targetPath: targetPath ?? null });
  return resolve(undefined);
}

export function getExcluded(): Promise<string[]> {
  if (IS_TAURI) return invoke<string[]>("get_excluded");
  return resolve([]);
}

export function removeExcluded(entry: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("remove_excluded", { entry });
  return resolve(undefined);
}

export function getPinned(): Promise<string[]> {
  if (IS_TAURI) return invoke<string[]>("get_pinned");
  return resolve([]);
}

export function setPinned(ids: string[]): Promise<void> {
  if (IS_TAURI) return invoke<void>("set_pinned", { ids });
  return resolve(undefined);
}

export function getSettings(): Promise<Settings> {
  if (IS_TAURI) return invoke<Settings>("get_settings");
  return resolve(DEFAULT_SETTINGS);
}

export function setSettings(settings: Settings): Promise<void> {
  if (IS_TAURI) return invoke<void>("set_settings", { settings });
  return resolve(undefined);
}

// ---- Sidebar ----
export function getSidebarItems(): Promise<SidebarItem[]> {
  if (IS_TAURI) return invoke<SidebarItem[]>("get_sidebar_items");
  return resolve(MOCK_SIDEBAR);
}

export function createSidebarItem(
  itemType: SidebarItemType,
  name: string,
  parentId: string | null,
  appId?: string,
  appName?: string,
  appIcon?: string,
): Promise<SidebarItem> {
  if (IS_TAURI)
    return invoke<SidebarItem>("create_sidebar_item", {
      itemType,
      name,
      parentId,
      appId: appId ?? null,
      appName: appName ?? null,
      appIcon: appIcon ?? null,
    });
  return resolve({
    id: "mock-" + Date.now(),
    itemType,
    name,
    parentId,
    content: null,
    appId: appId ?? null,
    appName: appName ?? null,
    appIcon: appIcon ?? null,
    createdAt: Date.now(),
  });
}

export function deleteSidebarItem(id: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("delete_sidebar_item", { id });
  return resolve(undefined);
}

export function updateSidebarItem(
  id: string,
  name?: string,
  content?: string,
): Promise<void> {
  if (IS_TAURI)
    return invoke<void>("update_sidebar_item", {
      id,
      name: name ?? null,
      content: content ?? null,
    });
  return resolve(undefined);
}

export function openInChrome(url: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("open_in_chrome", { url });
  return resolve(undefined);
}

export function startTrendingServer(): Promise<void> {
  if (IS_TAURI) return invoke<void>("start_trending_server");
  return resolve(undefined);
}

export function getSystemStats(): Promise<SystemStats> {
  if (IS_TAURI) return invoke<SystemStats>("get_system_stats");
  return resolve(MOCK_STATS);
}

export function getRecentFiles(count?: number): Promise<RecentFileInfo[]> {
  if (IS_TAURI)
    return invoke<RecentFileInfo[]>("get_recent_files", { count: count ?? null });
  return resolve(MOCK_RECENT);
}

// ---- Clipboard ----
export function readClipboard(): Promise<string> {
  if (IS_TAURI) return invoke<string>("read_clipboard");
  return resolve("示例文本：在浏览器预览中无法读取真实剪贴板");
}

export function writeClipboard(text: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("write_clipboard", { text });
  return resolve(undefined);
}

export function getClipboardHistory(): Promise<ClipboardEntry[]> {
  if (IS_TAURI) return invoke<ClipboardEntry[]>("get_clipboard_history");
  return resolve(MOCK_CLIP);
}

export function clearClipboardHistory(): Promise<void> {
  if (IS_TAURI) return invoke<void>("clear_clipboard_history");
  return resolve(undefined);
}

export function deleteClipboardEntry(id: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("delete_clipboard_entry", { id });
  return resolve(undefined);
}

// ---- Color Picker ----
export function getPixelColor(): Promise<ColorInfo> {
  if (IS_TAURI) return invoke<ColorInfo>("get_pixel_color");
  return resolve(MOCK_COLOR);
}

// ---- Network Speed ----
export function getNetworkSpeed(): Promise<NetworkSpeed> {
  if (IS_TAURI) return invoke<NetworkSpeed>("get_network_speed");
  return resolve(MOCK_NETWORK);
}

// ---- Overlay (global hotkey) mode ----
export function setOverlay(value: boolean): Promise<void> {
  if (IS_TAURI) return invoke<void>("set_overlay", { value });
  return resolve(undefined);
}

// ---- Global file search ----
const MOCK_FILES: FileSearchResult[] = [
  { name: "季度汇报.pptx", path: "C:\\Users\\user\\Documents\\季度汇报.pptx", isDir: false },
  { name: "产品预算表.xlsx", path: "C:\\Users\\user\\Documents\\产品预算表.xlsx", isDir: false },
  { name: "用户访谈", path: "C:\\Users\\user\\Documents\\用户访谈", isDir: true },
];

const MOCK_BOOKMARKS: Bookmark[] = [
  { name: "GitHub", url: "https://github.com" },
  { name: "MDN Web Docs", url: "https://developer.mozilla.org" },
  { name: "阮一峰的网络日志", url: "https://www.ruanyifeng.com/blog" },
];

export function searchFiles(query: string, max?: number): Promise<FileSearchResult[]> {
  if (IS_TAURI)
    return invoke<FileSearchResult[]>("search_files", { query, max: max ?? null });
  const q = query.toLowerCase();
  return resolve(
    MOCK_FILES.filter((f) => f.name.toLowerCase().includes(q)).slice(0, max ?? 20),
  );
}

export function getBookmarks(): Promise<Bookmark[]> {
  if (IS_TAURI) return invoke<Bookmark[]>("get_bookmarks");
  return resolve(MOCK_BOOKMARKS);
}

export function openPath(path: string): Promise<void> {
  if (IS_TAURI) return invoke<void>("open_path", { path });
  return resolve(undefined);
}

/* ── 自动更新 ── */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  date?: string | null;
  body?: string | null;
}

export function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!IS_TAURI) return resolve(null);
  return invoke<UpdateInfo | null>("check_for_update");
}

export function installUpdate(): Promise<void> {
  if (!IS_TAURI) return resolve(undefined);
  return invoke<void>("install_update");
}
