import { useEffect, useState, useCallback, useRef } from "react";
import { startTrendingServer, openInChrome } from "../lib/invoke";
import { Button } from "@/components/ui/button";

interface PlatformConfig {
  name: string;
  color: string;
  category: string;
  api: string;
}

interface TrendingItem {
  rank: number;
  title: string;
  url: string;
  source: string;
  metric: string;
  tag: string;
  desc: string;
  author: string;
}

interface PlatformData {
  key: string;
  name: string;
  color: string;
  category: string;
  updated_at: string;
  items: TrendingItem[];
  error: string;
}

interface TrendingData {
  updated_at: string;
  platforms: Record<string, PlatformData>;
}

const API_BASE = "http://127.0.0.1:18765";

const PLATFORM_ORDER = [
  "weibo", "zhihu", "baidu", "bilibili", "douyin",
  "toutiao", "36kr", "juejin", "ithome", "sspai",
  "thepaper", "huxiu", "csdn", "v2ex",
];

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  bilibili: { name: "哔哩哔哩", color: "#00a1d6", category: "视频", api: "bilibili" },
  douyin: { name: "抖音", color: "#161823", category: "短视频", api: "douyin" },
  weibo: { name: "微博", color: "#e6162d", category: "社交", api: "weibo" },
  zhihu: { name: "知乎", color: "#0084ff", category: "问答", api: "zhihu" },
  baidu: { name: "百度", color: "#2932e1", category: "搜索", api: "baidu" },
  toutiao: { name: "今日头条", color: "#f04142", category: "资讯", api: "toutiao" },
  "36kr": { name: "36氪", color: "#0061fe", category: "科技", api: "36kr" },
  juejin: { name: "稀土掘金", color: "#1e80ff", category: "技术", api: "juejin" },
  ithome: { name: "IT之家", color: "#d9261d", category: "科技", api: "ithome" },
  sspai: { name: "少数派", color: "#d12c2c", category: "数码", api: "sspai" },
  thepaper: { name: "澎湃新闻", color: "#ea413c", category: "新闻", api: "thepaper" },
  huxiu: { name: "虎嗅", color: "#ff5722", category: "商业", api: "huxiu" },
  csdn: { name: "CSDN", color: "#fc5531", category: "技术", api: "csdn" },
  v2ex: { name: "V2EX", color: "#3a5f0b", category: "社区", api: "v2ex" },
};

/* 平台拖拽排序：用户自定义顺序持久化到 localStorage */
const ORDER_KEY = "trending_platform_order";

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const known = new Set(PLATFORM_ORDER);
        const set = new Set(arr as string[]);
        const coversAll = PLATFORM_ORDER.every((k) => set.has(k));
        const onlyKnown = (arr as string[]).every((k) => known.has(k));
        if (coversAll && onlyKnown) return arr as string[];
      }
    }
  } catch { /* ignore */ }
  return [...PLATFORM_ORDER];
}

function saveOrder(order: string[]): void {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* 本地缓存：进热搜视图先秒显上次内容，后台再静默刷新，避免白屏等待 */
const TRENDING_CACHE_KEY = "trending_cache";
const TRENDING_CACHE_TTL = 30 * 60 * 1000;

function getCache<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > maxAge) { localStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}

function setCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
}

export default function TrendingView() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TrendingItem[] | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoStarting, setAutoStarting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [platformOrder, setPlatformOrder] = useState<string[]>(() => loadOrder());
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  const reorder = useCallback((from: number | null, to: number) => {
    if (from === null || from === to) return;
    setPlatformOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveOrder(next);
      return next;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setPlatformOrder([...PLATFORM_ORDER]);
    saveOrder([...PLATFORM_ORDER]);
  }, []);
  const searchTimer = useRef<number | null>(null);

  const checkServer = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/config`, { method: "GET" }, 4000);
      if (res.ok) { setServerReady(true); return true; }
    } catch { /* ignore */ }
    setServerReady(false);
    return false;
  }, []);

  const loadData = useCallback(async () => {
    // 1) 先秒显浏览器缓存，避免白屏等待
    const cached = getCache<TrendingData>(TRENDING_CACHE_KEY, TRENDING_CACHE_TTL);
    if (cached && cached.platforms) {
      setData(cached);
      setLoading(false);
    }
    // 2) 再向本地服务拉取最新（命中即返回缓存，极快）
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/data`, {}, 12000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const result = await res.json();
      if (result.ok) {
        setData(result.data);
        setCache(TRENDING_CACHE_KEY, result.data);
        setError(null);
        return true;
      } else throw new Error(result.message || result.error || "加载失败");
    } catch (e) {
      // 仅当没有任何缓存可显示时才报错
      if (!cached) setError(String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const manualRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    setServerReady(false);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      let ready = await checkServer();
      if (!mounted) return;
      if (!ready) {
        setAutoStarting(true);
        try { await startTrendingServer(); } catch { /* ignore */ }
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 800));
          if (!mounted) return;
          ready = await checkServer();
          if (ready) break;
        }
        setAutoStarting(false);
      }
      if (!mounted) return;
      if (ready) await loadData();
      else { setLoading(false); setError("热搜服务启动失败，请检查 Python 环境或点击重试"); }
    };
    init();
    return () => { mounted = false; };
  }, [checkServer, loadData, retryCount]);

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/refreshall`, {}, 90000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const result = await res.json();
      if (result.ok) { setData(result.data); setCache(TRENDING_CACHE_KEY, result.data); setError(null); }
      else throw new Error(result.error || "刷新失败");
    } catch (e) {
      setError("部分平台刷新失败，已显示缓存数据 (" + String(e).slice(0, 50) + ")");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const refreshPlatform = useCallback(async (key: string) => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/refresh?platform=${encodeURIComponent(key)}`, {}, 45000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const result = await res.json();
      if (result.ok && data) {
        setData({ ...data, platforms: { ...data.platforms, [key]: result.data.platforms[key] } });
      }
    } catch { /* ignore */ }
  }, [data]);

  const doSearch = useCallback((query: string) => {
    if (!query.trim()) { setSearchResults(null); return; }
    const q = query.trim().toLowerCase();
    const results: TrendingItem[] = [];
    if (data) {
      for (const key of platformOrder) {
        const platform = data.platforms[key];
        if (!platform) continue;
        for (const item of platform.items) {
          if (item.title.toLowerCase().includes(q)) {
            results.push({ ...item, source: platform.name });
          }
        }
      }
    }
    setSearchResults(results.slice(0, 50));
  }, [data]);

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => doSearch(value), 300);
  };

  const getDisplayItems = (): { items: TrendingItem[]; title: string; subtitle: string } => {
    if (searchResults !== null) {
      return { items: searchResults, title: `"${searchQuery}" 的搜索结果`, subtitle: `共 ${searchResults.length} 条` };
    }
    if (currentPlatform && data?.platforms[currentPlatform]) {
      const platform = data.platforms[currentPlatform];
      return {
        items: platform.items.slice(0, itemCount),
        title: platform.name,
        subtitle: `更新于 ${platform.updated_at} | 共 ${platform.items.length} 条`,
      };
    }
    const allItems: TrendingItem[] = [];
    if (data) {
      for (const key of platformOrder) {
        const platform = data.platforms[key];
        if (!platform) continue;
        for (let i = 0; i < Math.min(3, platform.items.length); i++) {
          allItems.push({ ...platform.items[i], source: platform.name });
        }
      }
    }
    return {
      items: allItems.slice(0, itemCount),
      title: "全部热榜",
      subtitle: `${platformOrder.length} 个平台实时聚合`,
    };
  };

  const { items, title, subtitle } = getDisplayItems();

  const openUrl = (url: string) => {
    if (url && url !== "#") {
      openInChrome(url).catch(() => { window.open(url, "_blank"); });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-6 w-6">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-ink-100 border-t-accent dark:border-ink-800 dark:border-t-accent" />
          </div>
          <span className="text-[14px] text-ink-faint">
            {autoStarting ? "正在自动启动热搜服务..." : "正在加载热搜数据..."}
          </span>
        </div>
      </div>
    );
  }

  if (!serverReady && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center px-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-ink-50 dark:bg-ink-800/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 2a10 10 0 0 1 10 10" /><path d="M22 12h-2M12 12l4-4" />
            </svg>
          </div>
          <h3 className="text-[16px] font-medium text-ink-muted">热搜服务连接失败</h3>
          <p className="text-[13px] text-ink-faint">{error || "自动启动失败，可点击重试或手动启动服务"}</p>
          <code className="text-[12px] bg-ink-50 dark:bg-ink-800/30 px-3 py-2 rounded-lg text-ink-muted font-mono">
            需 Python：安装时勾选 "Add to Python to PATH"
          </code>
          <Button onClick={manualRetry} className="mt-1">重新连接</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar - Platform List */}
      <div className="w-48 flex-shrink-0 border-r border-ink-200/30 dark:border-ink-700/30 flex flex-col">
        <div className="px-3 py-3 border-b border-ink-200/30 dark:border-ink-700/30">
          <h2 className="text-[16px] font-semibold text-ink dark:text-ink tracking-tight">热搜聚合</h2>
          <p className="text-[12px] text-ink-faint mt-0.5">{platformOrder.length} 个平台实时追踪</p>
        </div>

        <div className="px-2.5 py-2.5">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索话题..."
              className="w-full pl-7 pr-2.5 py-1.5 text-[13px] bg-ink-50/40 dark:bg-ink-800/20 border border-ink-200/30 dark:border-ink-700/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/20 text-ink-muted placeholder-ink-faint transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          <button
            onClick={() => { setCurrentPlatform(null); setSearchResults(null); setSearchQuery(""); }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${!currentPlatform && searchResults === null ? "bg-accent-soft text-accent font-medium" : "text-ink-muted hover:bg-ink-100/30 dark:hover:bg-ink-800/20"}`}
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ink-100 dark:bg-ink-800/30 text-[10px] font-bold text-ink-faint">全</span>
            全部热榜
          </button>

          <div className="my-1.5 divider-soft" />
          <div className="flex items-center justify-between px-2 mb-1">
            <p className="label-mono">平台</p>
            <button
              onClick={resetOrder}
              title="恢复默认顺序"
              className="text-[11px] text-ink-faint hover:text-accent transition-colors"
            >
              重置
            </button>
          </div>
          <div className="space-y-0.5">
            {platformOrder.map((key, i) => {
              const cfg = PLATFORM_CONFIG[key];
              if (!cfg) return null;
              const isDragging = draggingIndex === i;
              const isOver = overIndex === i && draggingIndex !== null && draggingIndex !== i;
              return (
                <button
                  key={key}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i;
                    setDraggingIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    try { e.dataTransfer.setData("text/plain", key); } catch { /* ignore */ }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overIndex !== i) setOverIndex(i);
                  }}
                  onDragLeave={() => { if (overIndex === i) setOverIndex(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorder(dragFrom.current, i);
                    setDraggingIndex(null);
                    setOverIndex(null);
                    dragFrom.current = null;
                  }}
                  onDragEnd={() => {
                    setDraggingIndex(null);
                    setOverIndex(null);
                    dragFrom.current = null;
                  }}
                  onClick={() => { setCurrentPlatform(key); setSearchResults(null); setSearchQuery(""); }}
                  className={`group/plat flex w-full select-none cursor-grab active:cursor-grabbing items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${isDragging ? "opacity-40" : ""} ${isOver ? "bg-accent-soft/60 ring-1 ring-accent/40" : ""} ${currentPlatform === key ? "bg-accent-soft text-accent font-medium" : "text-ink-muted hover:bg-ink-100/30 dark:hover:bg-ink-800/20"}`}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white text-[10px] font-bold" style={{ backgroundColor: cfg.color }}>
                    {cfg.name.charAt(0)}
                  </span>
                  <span className="flex-1 truncate">{cfg.name}</span>
                  <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint opacity-0 group-hover/plat:opacity-60" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-2.5 py-2 border-t border-ink-200/30 dark:border-ink-700/30">
          <Button onClick={refreshAll} disabled={refreshing} className="w-full">
            <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? "刷新中..." : "刷新全部"}
          </Button>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex h-11 shrink-0 items-center justify-between px-5 border-b border-ink-200/30 dark:border-ink-700/30">
          <div>
            <h2 className="text-[15px] font-medium text-ink dark:text-ink">{title}</h2>
            <p className="text-[12px] text-ink-faint">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1">
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setItemCount(n)}
                className={`px-2 py-0.5 rounded text-[12px] transition-colors ${itemCount === n ? "bg-accent-soft text-accent font-medium" : "text-ink-faint hover:bg-ink-100/30"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[14px] text-ink-faint">暂无数据</p>
            </div>
          ) : (
            <div className="divide-y divide-line dark:divide-line">
              {items.map((item, idx) => (
                <div
                  key={`${item.source}-${item.rank}-${idx}`}
                  onClick={() => openUrl(item.url)}
                  className="flex items-start gap-3 px-5 py-2.5 hover:bg-ink-100/20 dark:hover:bg-ink-800/15 cursor-pointer transition-colors group"
                >
                  <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[12px] font-medium mt-0.5 ${
                    item.rank <= 3 ? "bg-accent-soft text-accent" : "text-ink-faint"
                  }`}>
                    {item.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-ink-muted dark:text-ink-muted leading-snug group-hover:text-ink dark:group-hover:text-ink transition-colors">
                        {item.title}
                      </span>
                      {item.tag && (
                        <span className="flex-shrink-0 rounded bg-ink-50 dark:bg-ink-800/20 px-1 py-0 text-[11px] text-ink-faint">
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-ink-faint">{item.source}</span>
                      {item.metric && <span className="text-[12px] text-ink-faint">{item.metric}</span>}
                      {item.author && <span className="text-[12px] text-ink-faint">{item.author}</span>}
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
