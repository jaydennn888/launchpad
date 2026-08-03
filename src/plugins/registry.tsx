import type { ReactNode } from "react";

/** Callbacks a plugin command can use to perform actions. */
export interface PluginActionContext {
  openUrl: (url: string) => void;
  openWebView: (url: string, title: string) => void;
  openInChrome: (url: string) => void;
}

/** A single command a plugin contributes to the command palette. */
export interface PluginCommand {
  id: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  section: string;
  run: () => void;
}

/** A plugin definition (v1: built-in only; market loader is a future phase). */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  defaultEnabled: boolean;
  commands: (ctx: PluginActionContext) => PluginCommand[];
}

const STORAGE_KEY = "launchpad.plugins.enabled";

function readEnabled(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeEnabled(map: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function isPluginEnabled(p: Plugin): boolean {
  const map = readEnabled();
  if (p.id in map) return map[p.id];
  return p.defaultEnabled;
}

export function setPluginEnabled(id: string, enabled: boolean) {
  const map = readEnabled();
  map[id] = enabled;
  writeEnabled(map);
}

// ── inline icons (kept local so the registry stays dependency-free) ──
const IconGlobe = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth={1.5} fill="none">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </svg>
);
const IconPalette = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth={1.5} fill="none">
    <circle cx="13.5" cy="6.5" r="1.5" />
    <circle cx="17.5" cy="10.5" r="1.5" />
    <circle cx="8.5" cy="7.5" r="1.5" />
    <circle cx="6.5" cy="12.5" r="1.5" />
    <path d="M12 2a10 10 0 0 0 0 20c1.5 0 2-1 2-2 0-1.5 1-2 2-2h2a4 4 0 0 0 4-4 8 8 0 0 0-12-10z" />
  </svg>
);
const IconTranslate = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth={1.5} fill="none">
    <path d="M4 5h7M7 4v1c0 4-2 7-7 9M5 9c0 3 3 5 7 6M13 20l3-8 3 8M14.5 17h5" />
  </svg>
);
const IconHash = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth={1.5} fill="none">
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </svg>
);

export const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: "websearch",
    name: "网页搜索",
    description: "一键打开 Google / Bing 直达结果页",
    icon: <IconGlobe />,
    defaultEnabled: true,
    commands: (ctx) => [
      {
        id: "pw-google",
        title: "Google 搜索",
        subtitle: "打开 google.com",
        icon: <IconGlobe />,
        section: "网页搜索",
        run: () => ctx.openUrl("https://www.google.com"),
      },
      {
        id: "pw-bing",
        title: "Bing 搜索",
        subtitle: "打开 bing.com",
        icon: <IconGlobe />,
        section: "网页搜索",
        run: () => ctx.openUrl("https://www.bing.com"),
      },
    ],
  },
  {
    id: "color",
    name: "颜色转换",
    description: "HEX / RGB / HSL 在线互转小工具",
    icon: <IconPalette />,
    defaultEnabled: true,
    commands: (ctx) => [
      {
        id: "pc-color",
        title: "颜色转换工具",
        subtitle: "打开在线颜色转换器",
        icon: <IconPalette />,
        section: "颜色转换",
        run: () => ctx.openUrl("https://www.css-font.com/color"),
      },
    ],
  },
  {
    id: "translate",
    name: "翻译",
    description: "调用 DeepL 在线翻译",
    icon: <IconTranslate />,
    defaultEnabled: false,
    commands: (ctx) => [
      {
        id: "pt-deepl",
        title: "DeepL 翻译",
        subtitle: "打开 deepl.com",
        icon: <IconTranslate />,
        section: "翻译",
        run: () => ctx.openUrl("https://www.deepl.com/translator"),
      },
    ],
  },
  {
    id: "devdocs",
    name: "开发者文档",
    description: "快捷访问 MDN 等开发文档",
    icon: <IconHash />,
    defaultEnabled: false,
    commands: (ctx) => [
      {
        id: "pd-mdn",
        title: "MDN Web Docs",
        subtitle: "打开 developer.mozilla.org",
        icon: <IconHash />,
        section: "开发者文档",
        run: () => ctx.openUrl("https://developer.mozilla.org"),
      },
    ],
  },
];

export function getEnabledPlugins(): Plugin[] {
  return BUILTIN_PLUGINS.filter(isPluginEnabled);
}

export function buildPluginCommands(ctx: PluginActionContext): PluginCommand[] {
  const out: PluginCommand[] = [];
  for (const p of getEnabledPlugins()) {
    for (const c of p.commands(ctx)) out.push(c);
  }
  return out;
}
