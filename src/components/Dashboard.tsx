import { useEffect, useState, useCallback, type ComponentType } from "react";
import type { SystemStats, RecentFileInfo, TodoItem } from "../types";
import { getSystemStats, getRecentFiles, launchApp, revealApp, openInChrome } from "../lib/invoke";
import { getLunarDate } from "../lib/lunar";
import ClipboardHistory from "./ClipboardHistory";
import PomodoroTimer from "./PomodoroTimer";
import { Icon } from "./icons";
import { Card } from "@/components/ui/card";
import { motion } from "motion/react";

/* ------------------------------------------------------------------ */
/*  Local types                                                       */
/* ------------------------------------------------------------------ */

interface QuoteData {
  content: string;
  author: string;
}

/* ── 本地名言备用数据 ── */
const LOCAL_QUOTES: QuoteData[] = [
  { content: "天行健，君子以自强不息。", author: "周易" },
  { content: "路漫漫其修远兮，吾将上下而求索。", author: "屈原" },
  { content: "不积跬步，无以至千里；不积小流，无以成江海。", author: "荀子" },
  { content: "宝剑锋从磨砺出，梅花香自苦寒来。", author: "古训" },
  { content: "海纳百川，有容乃大；壁立千仞，无欲则刚。", author: "林则徐" },
  { content: "静以修身，俭以养德。非淡泊无以明志，非宁静无以致远。", author: "诸葛亮" },
  { content: "勿以善小而不为，勿以恶小而为之。", author: "刘备" },
  { content: "千里之行，始于足下。", author: "老子" },
  { content: "纸上得来终觉浅，绝知此事要躬行。", author: "陆游" },
  { content: "业精于勤，荒于嬉；行成于思，毁于随。", author: "韩愈" },
  { content: "山不在高，有仙则名；水不在深，有龙则灵。", author: "刘禹锡" },
  { content: "先天下之忧而忧，后天下之乐而乐。", author: "范仲淹" },
  { content: "人生自古谁无死，留取丹心照汗青。", author: "文天祥" },
  { content: "落红不是无情物，化作春泥更护花。", author: "龚自珍" },
  { content: "生活不止眼前的苟且，还有诗和远方。", author: "高晓松" },
  { content: "愿你历尽千帆，归来仍是少年。", author: "苏轼（化用）" },
  { content: "心若没有栖息的地方，到哪里都是流浪。", author: "三毛" },
  { content: "你若盛开，清风自来。心若浮沉，浅笑安然。", author: "林徽因" },
  { content: "岁月极美，在于它必然的流逝。春花、秋月、夏日、冬雪。", author: "三毛" },
  { content: "我去旅行，是因为我决定了要去，并不是因为对风景的兴趣。", author: "加西亚·马尔克斯" },
];

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                     */
/* ------------------------------------------------------------------ */

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

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function DashboardHeader({ userName }: { userName: string }) {
  const [greeting, setGreeting] = useState("");
  const [dateText, setDateText] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours();
      const greet = h < 6 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
      const date = now.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
      });
      const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      setGreeting(greet);
      setDateText(date);
      setClock(time);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="px-6 pt-7 pb-4 shrink-0">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
            <p className="text-[12px] font-medium text-ink-muted">{greeting}，{userName}</p>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[27px] font-semibold tracking-tight text-ink dark:text-ink leading-none">
              {userName}的工作台
            </h1>
            <span className="text-[26px] font-semibold tabular-nums tracking-tight text-accent leading-none">
              {clock}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-ink-muted">{dateText}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  2. System Stats Widget                                            */
/* ------------------------------------------------------------------ */

function SystemStatsWidget() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try { const s = await getSystemStats(); setStats(s); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); const timer = setInterval(fetchStats, 10000); return () => clearInterval(timer); }, [fetchStats]);

  const toGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);

  const bars = stats ? [
    { label: "CPU", pct: stats.cpuUsage, fg: "bg-accent" },
    { label: "内存", pct: stats.memoryTotal > 0 ? (stats.memoryUsed / stats.memoryTotal) * 100 : 0, detail: `${toGB(stats.memoryUsed)}/${toGB(stats.memoryTotal)} GB`, fg: "bg-emerald-500" },
    { label: "磁盘", pct: stats.diskPercent, detail: `${toGB(stats.diskUsed)}/${toGB(stats.diskTotal)} GB`, fg: "bg-violet-500" },
  ] : [];

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 transition-shadow">
      <h3 className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />系统状态</h3>

      {loading && !stats && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse" />
              <div className="h-1.5 w-full bg-ink-100 dark:bg-ink-800/40 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && bars.length > 0 && (
        <div className="space-y-4">
          {bars.map((bar) => (
            <div key={bar.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="label-mono">{bar.label}</span>
                {bar.detail && <span className="text-[10px] text-ink-faint">{bar.detail}</span>}
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800/30 overflow-hidden">
                <div className={`h-full rounded-full ${bar.fg} transition-all duration-500`} style={{ width: `${Math.min(bar.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !stats && <p className="text-[11px] text-ink-faint">获取状态失败</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3. Daily Quote Widget                                             */
/* ------------------------------------------------------------------ */

function DailyQuoteWidget() {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchQuote = useCallback(async () => {
    localStorage.removeItem("dashboard_quote_cache");
    setLoading(true);
    try {
      const res = await fetch("https://v1.hitokoto.cn/?c=i&c=k&c=d&encode=json", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const q: QuoteData = { content: json.hitokoto ?? "", author: json.from_who || json.from || "佚名" };
      if (q.content) { setQuote(q); setCache("dashboard_quote_cache", q); return; }
      throw new Error("Empty content");
    } catch {
      const random = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
      setQuote(random); setCache("dashboard_quote_cache", random);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const cached = getCache<QuoteData>("dashboard_quote_cache", 60 * 60 * 1000);
    if (cached) { setQuote(cached); setLoading(false); }
    else { fetchQuote(); }
  }, [fetchQuote]);

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 flex flex-col transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />每日一言</h3>
        <button onClick={fetchQuote} className="btn-micro p-1 rounded-md text-ink-faint hover:text-ink-muted transition-colors" title="换一句">
          <Icon name="refresh" className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 w-full">
            <div className="h-3 w-full bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse mt-4" />
          </div>
        </div>
      )}

      {!loading && quote && (
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[12px] italic text-ink-muted dark:text-ink-muted leading-relaxed">"{quote.content}"</p>
          <p className="text-[10px] text-ink-faint mt-3 text-right">—— {quote.author}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  4. Calendar Widget                                                */
/* ------------------------------------------------------------------ */

function CalendarWidget() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prev = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else { setMonth((m) => m - 1); } };
  const next = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else { setMonth((m) => m + 1); } };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

  const getDayInfo = (d: number): { lunarText: string; holiday: string | null; jieqi: string | null; isHoliday: boolean } => {
    try {
      const lunar = getLunarDate(new Date(year, month, d));
      let lunarText = lunar.dayName;
      if (lunar.holiday) lunarText = lunar.holiday;
      else if (lunar.jieqi) lunarText = lunar.jieqi;
      else if (lunar.day === 1) lunarText = lunar.monthName + "月";
      return { lunarText, holiday: lunar.holiday, jieqi: lunar.jieqi, isHoliday: !!lunar.holiday || !!lunar.jieqi };
    } catch { return { lunarText: "", holiday: null, jieqi: null, isHoliday: false }; }
  };

  const todayLunar = getLunarDate(today);

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="btn-micro p-1 rounded-md text-ink-faint hover:text-ink-muted transition-colors">
          <Icon name="chevron-left" className="w-3.5 h-3.5" />
        </button>
        <div className="text-center">
          <h3 className="flex items-center justify-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />{year}年{month + 1}月</h3>
          <p className="text-[9px] text-ink-faint mt-0.5">
            {todayLunar.yearName}年 · {todayLunar.zodiac}年 · {todayLunar.text}
            {todayLunar.holiday && ` · ${todayLunar.holiday}`}
            {todayLunar.jieqi && !todayLunar.holiday && ` · ${todayLunar.jieqi}`}
          </p>
        </div>
        <button onClick={next} className="btn-micro p-1 rounded-md text-ink-faint hover:text-ink-muted transition-colors">
          <Icon name="chevron-right" className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mx-auto grid max-w-[380px] grid-cols-7 gap-0 mb-1">
        {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
          <div key={d} className={`text-center text-[9px] py-1 ${i === 0 || i === 6 ? "text-red-400 dark:text-red-400" : "text-ink-faint"}`}>{d}</div>
        ))}
      </div>

      <div className="mx-auto grid max-w-[380px] grid-cols-7 gap-0">
        {days.map((d, i) => {
          if (d === null) return <div key={i} className="text-center py-0.5"><div className="w-6 h-7" /></div>;
          const info = getDayInfo(d);
          const dow = new Date(year, month, d).getDay();
          const isWeekend = dow === 0 || dow === 6;
          return (
            <div key={i} className="text-center py-0.5">
              <div className={`inline-flex flex-col items-center justify-center w-7 h-8 rounded-md transition-all ${
                isToday(d) ? "bg-accent text-white dark:text-paper-deep" :
                info.isHoliday ? "bg-red-500/8 dark:bg-red-500/10" : "hover:bg-ink-100/40 dark:hover:bg-ink-800/20"
              }`}>
                <span className={`text-[10px] leading-none ${
                  isToday(d) ? "text-white" :
                  info.holiday ? "text-red-500 dark:text-red-400 font-medium" :
                  info.jieqi ? "text-emerald-600 dark:text-emerald-400" :
                  isWeekend ? "text-red-400 dark:text-red-400" : "text-ink-muted"
                }`}>{d}</span>
                <span className={`text-[7px] leading-none mt-0.5 truncate max-w-[24px] ${
                  isToday(d) ? "text-white/80" :
                  info.holiday ? "text-red-500 dark:text-red-400" :
                  info.jieqi ? "text-emerald-500 dark:text-emerald-400" : "text-ink-faint"
                }`}>{info.lunarText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  5. Calculator Widget                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  6. Todo Widget                                                    */
/* ------------------------------------------------------------------ */

const TODO_KEY = "launchpad_todos"; // 与左侧独立的「待办视图」共用同一数据源,避免首页与待办视图数据不同步

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(TODO_KEY);
    if (raw) return JSON.parse(raw) as TodoItem[];
    // 一次性迁移:把旧首页待办(dashboard_todos)并入新数据源,避免历史数据丢失
    const legacy = localStorage.getItem("dashboard_todos");
    if (legacy) {
      const items = JSON.parse(legacy) as TodoItem[];
      localStorage.setItem(TODO_KEY, JSON.stringify(items));
      localStorage.removeItem("dashboard_todos");
      return items;
    }
    return [];
  } catch { return []; }
}

function TodoWidget() {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  const [input, setInput] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); }, [todos]);

  const add = useCallback(() => {
    if (!input.trim()) return;
    setTodos((prev) => [{ id: genId(), text: input.trim(), done: false, createdAt: Date.now() }, ...prev]);
    setInput("");
  }, [input]);

  const toggle = useCallback((id: string) => { setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))); }, []);
  const remove = useCallback((id: string) => { setTodos((prev) => prev.filter((t) => t.id !== id)); }, []);
  const visible = showAll ? todos : todos.slice(0, 5);

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 flex flex-col transition-shadow">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />待办事项</h3>

      <div className="flex gap-1.5 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="添加待办..."
          className="flex-1 px-3 py-1.5 text-[11px] bg-ink-50/40 dark:bg-ink-800/20 border border-ink-200/30 dark:border-ink-700/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/30 text-ink-muted dark:text-ink-muted placeholder-ink-faint dark:placeholder-ink-faint transition-all"
        />
        <button onClick={add} className="px-3 py-1.5 bg-ink dark:bg-ink text-white dark:text-paper-deep rounded-lg text-[11px] font-medium hover:opacity-90 transition-opacity btn-micro">
          添加
        </button>
      </div>

      <div className="flex-1 space-y-0.5 min-h-0">
        {visible.length === 0 && <p className="text-[11px] text-ink-faint text-center py-4">暂无待办</p>}
        {visible.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ink-100/20 dark:hover:bg-ink-800/15 transition-all group">
            <button onClick={() => toggle(item.id)} className={`flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all ${item.done ? "bg-accent border-accent" : "border-ink-200 dark:border-ink-700"}`}>
                {item.done && (
                <Icon name="check" className="w-2.5 h-2.5 text-white dark:text-paper-deep" strokeWidth={3} />
              )}
            </button>
            <span className={`flex-1 text-[11px] truncate ${item.done ? "line-through text-ink-faint" : "text-ink-muted"}`}>{item.text}</span>
            <button onClick={() => remove(item.id)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-faint hover:text-red-500 transition-all">
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {todos.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-[10px] text-accent hover:text-accent/80 text-center transition-colors"
        >
          {showAll ? "收起" : `查看全部 (${todos.length} 项)`}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  6.5 Calculator Widget                                             */
/* ------------------------------------------------------------------ */

function CalculatorWidget() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("0");

  const handle = (v: string) => {
    if (v === "C") { setExpr(""); setResult("0"); return; }
    if (v === "⌫") { setExpr((e) => e.slice(0, -1)); return; }
    if (v === "=") {
      try {
        const safe = expr.replace(/[^0-9+\-*/().\s]/g, "");
        if (!safe) { setResult("0"); return; }
        // 本地安全求值:仅允许数字与四则运算符号
        const val = new Function(`"use strict"; return (${safe});`)() as number;
        if (!isFinite(val)) throw new Error("bad");
        setResult(String(val));
      } catch {
        setResult("错误");
      }
      return;
    }
    setExpr((e) => e + v);
  };

  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+"];
  const isOp = (k: string) => ["/", "*", "-", "+", "="].includes(k);

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 flex flex-col transition-shadow">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />计算器</h3>
      <div className="mb-2 flex items-stretch gap-2">
        <div className="flex-1 rounded-lg bg-ink-50/60 dark:bg-ink-800/30 p-2 text-right overflow-hidden">
          <div className="h-4 truncate text-[11px] text-ink-faint">{expr || "0"}</div>
          <div className="text-[18px] font-light tabular-nums text-ink dark:text-ink">{result}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <button onClick={() => handle("C")} className="flex-1 rounded-md bg-ink-100/60 dark:bg-ink-800/40 px-2 text-[12px] font-medium text-ink-muted hover:bg-ink-100 dark:hover:bg-ink-800/60 transition-colors">C</button>
          <button onClick={() => handle("⌫")} className="flex-1 rounded-md bg-ink-100/60 dark:bg-ink-800/40 px-2 text-[12px] font-medium text-ink-muted hover:bg-ink-100 dark:hover:bg-ink-800/60 transition-colors">⌫</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => handle(k)}
            className={`rounded-lg py-2 text-[13px] font-medium transition-colors ${
              isOp(k)
                ? "bg-accent/10 text-accent hover:bg-accent/20"
                : "bg-ink-50/60 dark:bg-ink-800/30 text-ink dark:text-ink hover:bg-ink-100/60 dark:hover:bg-ink-800/50"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  6.7 自媒体平台一键入口 Widget                                      */
/* ------------------------------------------------------------------ */

interface PlatformEntry {
  name: string;
  url: string;
  color: string;
}

/* 默认覆盖主流自媒体平台 + 创作/后台工具,可直接点击用 Chrome 打开 */
const DEFAULT_PLATFORMS: PlatformEntry[] = [
  { name: "抖音", url: "https://www.douyin.com", color: "#fe2c55" },
  { name: "抖音创作", url: "https://creator.douyin.com", color: "#161823" },
  { name: "小红书", url: "https://www.xiaohongshu.com", color: "#ff2442" },
  { name: "小红书创作", url: "https://creator.xiaohongshu.com", color: "#ff6699" },
  { name: "B站", url: "https://www.bilibili.com", color: "#00a1d6" },
  { name: "视频号", url: "https://channels.weixin.qq.com", color: "#07c160" },
  { name: "快手", url: "https://www.kuaishou.com", color: "#ff4906" },
  { name: "微博", url: "https://weibo.com", color: "#e6162d" },
  { name: "知乎", url: "https://www.zhihu.com", color: "#0084ff" },
  { name: "今日头条", url: "https://www.toutiao.com", color: "#f04142" },
  { name: "公众号", url: "https://mp.weixin.qq.com", color: "#2dc100" },
  { name: "剪映", url: "https://www.capcut.cn", color: "#1c1c1e" },
];

const PLATFORMS_KEY = "launchpad_platforms";

function loadPlatforms(): PlatformEntry[] {
  try {
    const raw = localStorage.getItem(PLATFORMS_KEY);
    if (raw) return JSON.parse(raw) as PlatformEntry[];
  } catch { /* ignore */ }
  return DEFAULT_PLATFORMS;
}

function SocialPlatformsWidget() {
  const [platforms, setPlatforms] = useState<PlatformEntry[]>(loadPlatforms);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const persist = (next: PlatformEntry[]) => {
    setPlatforms(next);
    try { localStorage.setItem(PLATFORMS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const open = (p: PlatformEntry) => { openInChrome(p.url).catch(() => { /* 打开失败静默 */ }); };

  const add = () => {
    const n = name.trim();
    let u = url.trim();
    if (!n || !u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    persist([...platforms, { name: n, url: u, color: "#64748b" }]);
    setName(""); setUrl(""); setAdding(false);
  };

  const remove = (p: PlatformEntry) => persist(platforms.filter((x) => x !== p));

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 flex flex-col transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />自媒体入口</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn-micro grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:text-ink-muted transition-colors"
          title="添加入口"
        >
          <span className="text-[15px] leading-none">＋</span>
        </button>
      </div>

      {adding && (
        <div className="mb-3 space-y-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称(如: 微博热搜)"
            className="w-full px-2.5 py-1.5 text-[11px] bg-ink-50/40 dark:bg-ink-800/20 border border-ink-200/30 dark:border-ink-700/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/30 text-ink-muted placeholder-ink-faint"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="链接 https://..."
            className="w-full px-2.5 py-1.5 text-[11px] bg-ink-50/40 dark:bg-ink-800/20 border border-ink-200/30 dark:border-ink-700/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/30 text-ink-muted placeholder-ink-faint"
          />
          <div className="flex gap-1.5">
            <button onClick={add} className="flex-1 px-2 py-1 bg-ink dark:bg-ink text-white dark:text-paper-deep rounded-lg text-[11px] font-medium hover:opacity-90 btn-micro">添加</button>
            <button onClick={() => { setAdding(false); setName(""); setUrl(""); }} className="px-2 py-1 rounded-lg text-[11px] text-ink-faint hover:text-ink-muted transition-colors">取消</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2.5">
        {platforms.map((p) => (
          <div key={p.url} className="group relative flex flex-col items-center gap-1">
            <button
              onClick={() => open(p)}
              title={p.url}
              className="grid h-11 w-11 place-items-center rounded-xl text-white text-[15px] font-semibold shadow-sm transition-transform hover:scale-105 active:scale-95"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1)}
            </button>
            <span className="max-w-[46px] truncate text-center text-[10px] text-ink-muted">{p.name}</span>
            <button
              onClick={() => remove(p)}
              title="移除"
              className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-ink-700 text-[9px] text-white transition-colors hover:bg-red-500 group-hover:flex"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-ink-faint">点击图标用 Chrome 打开 · 悬停可移除 · 右上角 ＋ 可添加</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  7. Recent Files Widget                                            */
/* ------------------------------------------------------------------ */

function RecentFilesWidget() {
  const [files, setFiles] = useState<RecentFileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try { const result = await getRecentFiles(10); setFiles(result); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const openFile = (path: string) => { launchApp(path).catch(() => { /* 打开失败静默处理 */ }); };
  const revealFile = (path: string) => { revealApp(path).catch(() => { /* 定位失败静默处理 */ }); };

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] border border-border bg-card p-6 flex flex-col transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />最近文件</h3>
        <button onClick={fetchFiles} className="btn-micro p-1 rounded-md text-ink-faint hover:text-ink-muted transition-colors" title="刷新">
          <Icon name="refresh" className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-ink-100 dark:bg-ink-800/40 animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-3/4 bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse" />
                <div className="h-2 w-1/2 bg-ink-100 dark:bg-ink-800/40 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && files.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] text-ink-faint">暂无最近文件</p>
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="flex-1 space-y-0.5 min-h-0 overflow-y-auto">
          {files.map((f, i) => (
            <div key={i} onClick={() => openFile(f.path)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ink-100/20 dark:hover:bg-ink-800/15 cursor-pointer transition-all group">
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-ink-50 dark:bg-ink-800/20 flex items-center justify-center text-ink-faint">
                {f.icon ? <img src={f.icon} alt="" className="w-4 h-4" /> : <Icon name="file" className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-ink-muted truncate">{f.name}</p>
                <p className="text-[9px] text-ink-faint">{f.modified}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); revealFile(f.path); }}
                title="在文件夹中打开"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint opacity-0 group-hover:opacity-100 hover:bg-ink-100/60 hover:text-ink-muted transition-all dark:hover:bg-ink-800/40"
              >
                <Icon name="folder" className="w-3.5 h-3.5" />
              </button>
              <Icon name="chevron-right" className="w-3 h-3 text-ink-faint opacity-0 group-hover:opacity-100 transition-all" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                    */
/* ------------------------------------------------------------------ */

const WIDGET_ORDER_KEY = "dashboard_widget_order";

const WIDGETS: { id: string; span: string; Comp: ComponentType }[] = [
  { id: "system", span: "col-span-1", Comp: SystemStatsWidget },
  { id: "pomodoro", span: "col-span-1", Comp: PomodoroTimer },
  { id: "quote", span: "col-span-1", Comp: DailyQuoteWidget },
  { id: "calendar", span: "col-span-1 md:col-span-2 xl:col-span-2", Comp: CalendarWidget },
  { id: "todo", span: "col-span-1", Comp: TodoWidget },
  { id: "calculator", span: "col-span-1", Comp: CalculatorWidget },
  { id: "clipboard", span: "col-span-1", Comp: ClipboardHistory },
  { id: "recent", span: "col-span-1 md:col-span-2 xl:col-span-2", Comp: RecentFilesWidget },
  { id: "social", span: "col-span-1 md:col-span-2 xl:col-span-2", Comp: SocialPlatformsWidget },
];

const WIDGET_IDS = WIDGETS.map((w) => w.id);

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(WIDGET_ORDER_KEY);
    if (!raw) return WIDGET_IDS;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return WIDGET_IDS;
    const valid = parsed.filter((id) => WIDGET_IDS.includes(id));
    const missing = WIDGET_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return WIDGET_IDS;
  }
}

function saveOrder(order: string[]): void {
  try { localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

export default function Dashboard({ userName = "张总" }: { userName?: string }) {
  const [order, setOrder] = useState<string[]>(loadOrder);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    setOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      saveOrder(next);
      return next;
    });
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="flex min-h-full flex-col">
      <DashboardHeader userName={userName} />
      <div className="dashboard-grid mx-auto grid max-w-[1320px] grid-cols-1 gap-6 px-6 pb-6 md:grid-cols-2 xl:grid-cols-3 auto-rows-min">
        {order.map((id, i) => {
          const w = WIDGETS.find((x) => x.id === id);
          if (!w) return null;
          const Comp = w.Comp;
          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest("input, textarea, button, a, [data-no-drag]")) {
                  e.preventDefault();
                  return;
                }
                setDragId(id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverId(id);
              }}
              onDragLeave={() => { if (overId === id) setOverId(null); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              className={`${w.span} group relative cursor-grab active:cursor-grabbing rounded-[var(--radius-lg)] transition-all ${
                dragId === id ? "opacity-40" : ""
              } ${
                overId === id && dragId !== id
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-paper dark:ring-offset-paper-deep"
                  : "hover:ring-2 hover:ring-accent/30"
              }`}
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -40px 0px" }}
                transition={{ duration: 0.4, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <Comp />
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
