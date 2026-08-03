import type { AppInfo } from "../types";

/** A named category with a list of keyword matchers. */
export interface Category {
  id: string;
  name: string;
  /** Keywords matched against the app name + target path (case-insensitive). */
  keywords: string[];
}

/**
 * Built-in auto-categorization rules.
 * Order matters: the first matching category wins.
 * Apps that don't match any rule fall into "其他".
 */
export const CATEGORIES: Category[] = [
  {
    id: "adobe",
    name: "Adobe",
    keywords: [
      "adobe",
      "photoshop",
      "illustrator",
      "indesign",
      "premiere",
      "after effects",
      "lightroom",
      "acrobat",
      "dreamweaver",
      "audition",
      "bridge",
      "creative cloud",
      "animate",
      "dimension",
      "spark",
      "substance",
      "media encoder",
      "character animator",
    ],
  },
  {
    id: "video",
    name: "视频",
    keywords: [
      "vlc",
      "potplayer",
      "mpv",
      "kmplayer",
      "qqplayer",
      "qqplayer",
      "iqiyi",
      "爱奇艺",
      "youku",
      "优酷",
      "bilibili",
      "哔哩哔哩",
      "tencentmeeting",
      "腾讯会议",
      "obs",
      "obs studio",
      "kdenlive",
      "davinci",
      "resolve",
      "finalcut",
      "shotcut",
      "handbrake",
      "format factory",
      "格式工厂",
      "剪映",
      "jianying",
      "capcut",
      "暴风",
      "storm",
      "mpc",
      "media player classic",
      "vlc media",
      "wmplayer",
      "电影和电视",
      "movies & tv",
      "plex",
      "kodi",
      "emby",
      "jellyfin",
    ],
  },
  {
    id: "photo",
    name: "照片",
    keywords: [
      "photoshop",
      "lightroom",
      "gimp",
      "paint.net",
      "paintdotnet",
      "acdsee",
      "capture one",
      "affinity photo",
      "pixelmator",
      "xnview",
      "irfanview",
      "faststone",
      "honeyview",
      "photoscape",
      "光影魔术手",
      "美图秀秀",
      "meitu",
      "snapseed",
      "canva",
      "photos",
      "照片",
      "windows photo",
      "相册",
      "digiKam",
      "rawtherapee",
      "darktable",
    ],
  },
  {
    id: "develop",
    name: "开发",
    keywords: [
      "code",
      "visual studio",
      "vscode",
      "cursor",
      "sublime",
      "webstorm",
      "pycharm",
      "intellij",
      "idea",
      "eclipse",
      "netbeans",
      "atom",
      "vim",
      "neovim",
      "emacs",
      "xcode",
      "android studio",
      "deveco",
      "git",
      "github",
      "gitlab",
      "sourcetree",
      "fork",
      "tower",
      "docker",
      "postman",
      "insomnia",
      "windsurf",
      "trae",
      "fleet",
      "rider",
      "clion",
      "goland",
      "rustrover",
      "datagrip",
      "phpstorm",
      "rubymine",
      "terminal",
      "powershell",
      "cmd",
      "putty",
      "winscp",
      "filezilla",
      "xshell",
      "moba",
      "tabby",
      "hyper",
      "alacritty",
      "wezterm",
      "navicat",
      "heidisql",
      "dbeaver",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "navigatr",
      "fontcreator",
    ],
  },
  {
    id: "browser",
    name: "浏览器",
    keywords: [
      "chrome",
      "firefox",
      "edge",
      "safari",
      "opera",
      "brave",
      "vivaldi",
      "arc",
      "maxthon",
      "遨游",
      "360se",
      "360浏览器",
      "qqbrowser",
      "qq浏览器",
      "ucbrowser",
      "搜狗",
      "sogou",
      "yandex",
      "chromium",
      "tor browser",
      "waterfox",
      "thorium",
    ],
  },
  {
    id: "office",
    name: "办公",
    keywords: [
      "word",
      "excel",
      "powerpoint",
      "outlook",
      "onenote",
      "office",
      "wps",
      "金山",
      "libreoffice",
      "openoffice",
      "typora",
      "notion",
      "obsidian",
      "logseq",
      "evernote",
      "印象笔记",
      "有道云",
      "youdao",
      "mindmaster",
      "xmind",
      "mindmanager",
      "freemind",
      "钉钉",
      "dingtalk",
      "企业微信",
      "wecom",
      "feishu",
      "飞书",
      "lark",
      "teams",
      "slack",
      "zoom",
      "腾讯会议",
      "foxmail",
      "foxit",
      "wps office",
      "金山文档",
      "腾讯文档",
      "石墨",
      "yuque",
      "语雀",
      "pages",
      "numbers",
      "keynote",
    ],
  },
  {
    id: "music",
    name: "音乐",
    keywords: [
      "spotify",
      "foobar",
      "aimp",
      "winamp",
      "itunes",
      "apple music",
      "qqmusic",
      "qq音乐",
      "netease",
      "网易云",
      "kugou",
      "酷狗",
      "kuwo",
      "酷我",
      "microsoft store music",
      "groove",
      "media monkey",
      "musicbee",
      "audacity",
      "cubase",
      "fl studio",
      "logic pro",
      "ableton",
      "studio one",
      "reaper",
      "mixcraft",
      "qqmusic",
    ],
  },
  {
    id: "game",
    name: "游戏",
    keywords: [
      "steam",
      "epic games",
      "battle.net",
      "riot",
      "origin",
      "ubisoft",
      "gog",
      "minecraft",
      "我的世界",
      "league of legends",
      "英雄联盟",
      "dota",
      "cs:go",
      "csgo",
      "valorant",
      "overwatch",
      "守望先锋",
      "genshin",
      "原神",
      "wegame",
      "xbox",
      "playstation",
      "nintendo",
      "game",
      "nvidia geforce experience",
      "geforce now",
    ],
  },
  {
    id: "social",
    name: "社交",
    keywords: [
      "wechat",
      "微信",
      "qq",
      "tim",
      "telegram",
      "discord",
      "skype",
      "line",
      "whatsapp",
      "signal",
      "slack",
      "飞书",
      "lark",
      "钉钉",
      "dingtalk",
      "微博",
      "weibo",
      "twitter",
      "x.com",
      "facebook",
      "instagram",
      "messenger",
      "snapchat",
      "reddit",
      "小红书",
      "zhihu",
      "知乎",
    ],
  },
  {
    id: "system",
    name: "系统",
    keywords: [
      "control panel",
      "控制面板",
      "settings",
      "设置",
      "file explorer",
      "资源管理器",
      "explorer",
      "task manager",
      "任务管理器",
      "registry",
      "注册表",
      "services",
      "服务",
      "event viewer",
      "事件查看器",
      "device manager",
      "设备管理器",
      "disk management",
      "磁盘管理",
      "powershell",
      "command prompt",
      "cmd",
      "terminal",
      "windows defender",
      "windows security",
      "安全中心",
      "windows update",
      "更新",
      "backup",
      "备份",
      "restore",
      "还原",
      "system",
      "recovery",
      "恢复",
      "microsoft store",
      "store",
      "商店",
      "snipping tool",
      "截图",
      "screenshot",
      "calculator",
      "计算器",
      "notepad",
      "记事本",
      "写字板",
      "wordpad",
      "paint",
      "画图",
      "character map",
      "字符映射表",
      "run",
      "运行",
      "磁贴",
      "computer",
      "此电脑",
      "pc",
      "winrar",
      "7-zip",
      "7zip",
      "bandizip",
      "haozip",
      "好压",
      "peazip",
      "unzip",
      "压缩",
      "驱动",
      "driver",
      "geforce",
      "radeon",
      "intel",
      "nvidia",
      "amd",
    ],
  },
];

const OTHER_ID = "other";
const OTHER_NAME = "其他";

/**
 * Classify a single app into a category.
 * Returns the category id (or "other" if no match).
 */
export function classifyApp(app: AppInfo): string {
  const haystack = `${app.name} ${app.targetPath}`.toLowerCase();
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        return cat.id;
      }
    }
  }
  return OTHER_ID;
}

/** Human-readable name for a category id. */
export function categoryName(id: string): string {
  if (id === OTHER_ID) return OTHER_NAME;
  return CATEGORIES.find((c) => c.id === id)?.name ?? OTHER_NAME;
}

/** All category ids in display order, including "其他". */
export function allCategoryIds(): string[] {
  return [...CATEGORIES.map((c) => c.id), OTHER_ID];
}

/** All category names in display order, including "其他". */
export function allCategoryNames(): { id: string; name: string }[] {
  return [...CATEGORIES.map((c) => ({ id: c.id, name: c.name })), { id: OTHER_ID, name: OTHER_NAME }];
}

/**
 * Group apps by auto-category.
 * Returns an ordered array of { id, name, apps }.
 * Empty categories are omitted.
 */
export function groupByCategory(apps: AppInfo[]): { id: string; name: string; apps: AppInfo[] }[] {
  const buckets = new Map<string, AppInfo[]>();
  for (const app of apps) {
    const cat = classifyApp(app);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(app);
  }
  const result: { id: string; name: string; apps: AppInfo[] }[] = [];
  for (const { id, name } of allCategoryNames()) {
    const list = buckets.get(id);
    if (list && list.length > 0) {
      result.push({ id, name, apps: list });
    }
  }
  return result;
}

/** Get distinct category names that actually have apps in the given list. */
export function getPresentCategoryNames(apps: AppInfo[]): string[] {
  const seen = new Set<string>();
  for (const app of apps) {
    const cat = classifyApp(app);
    seen.add(categoryName(cat));
  }
  // Return in display order
  const order = allCategoryNames();
  return order
    .filter((c) => seen.has(c.name))
    .map((c) => c.name)
    .filter((n) => n !== OTHER_NAME);
}
