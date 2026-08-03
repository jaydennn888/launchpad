export interface AppInfo {
  /** stable id = the .lnk file path */
  id: string;
  /** display name (lnk filename without extension) */
  name: string;
  /** full path to the .lnk file (used to launch) */
  lnkPath: string;
  /** resolved target exe path (best-effort, may be empty) */
  targetPath: string;
  /** png icon as data url, or null when extraction failed */
  icon: string | null;
  /** normalized lowercase name used for search */
  sortKey: string;
}

export interface Settings {
  /** theme preference: follow system / force light / force dark */
  theme: "system" | "light" | "dark";
  /** render all app icons in grayscale (B&W aesthetic) */
  grayscaleIcons: boolean;
  /** keep the window always on top */
  alwaysOnTop: boolean;
  /** snap the window to screen edges when it is moved near them */
  edgeSnap: boolean;
  /** hide the window into a thin edge strip after snapping */
  edgeAutoHide: boolean;
  /** turn the minimize button into a compact pinned-app dock */
  compactOnMinimize: boolean;
  /** compact dock layout direction */
  compactOrientation: "horizontal" | "vertical";
  /** sort apps by pinned, usage count and recent activity */
  smartSort: boolean;
  /** start Launchpad automatically when Windows starts */
  startWithWindows: boolean;
  /** 用户昵称,显示在侧边栏与仪表盘(可在设置中修改) */
  userName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  grayscaleIcons: false,
  alwaysOnTop: false,
  edgeSnap: true,
  edgeAutoHide: false,
  compactOnMinimize: true,
  compactOrientation: "horizontal",
  smartSort: true,
  startWithWindows: false,
  userName: "",
};

/** maximum number of pinned favorites */
export const MAX_PINS = 10;

/** Sidebar item type */
export type SidebarItemType = "folder" | "note" | "app";

export interface SidebarItem {
  id: string;
  itemType: SidebarItemType;
  name: string;
  parentId: string | null;
  content: string | null;
  appId: string | null;
  appName: string | null;
  appIcon: string | null;
  createdAt: number;
}

export interface SystemStats {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  diskPercent: number;
}

export interface RecentFileInfo {
  name: string;
  path: string;
  modified: string;
  icon: string | null;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
}

export interface ColorInfo {
  hex: string;
  rgb: string;
  x: number;
  y: number;
}

export interface NetworkSpeed {
  uploadKbps: number;
  downloadKbps: number;
}

export interface FileSearchResult {
  name: string;
  path: string;
  isDir: boolean;
}

export interface Bookmark {
  name: string;
  url: string;
}
