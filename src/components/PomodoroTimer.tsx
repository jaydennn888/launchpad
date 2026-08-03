import { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                 */
/* ------------------------------------------------------------------ */

type Mode = "focus" | "shortBreak" | "longBreak";

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const MODE_LABELS: Record<Mode, string> = {
  focus: "专注",
  shortBreak: "短休息",
  longBreak: "长休息",
};

const MODE_COLORS: Record<Mode, string> = {
  focus: "var(--accent)",
  shortBreak: "#10b981",
  longBreak: "#8b5cf6",
};

interface SessionRecord {
  date: string;   // YYYY-MM-DD
  count: number;
}

const STORAGE_KEY = "launchpad_pomodoro";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadRecords(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SessionRecord[];
    return arr.slice(-30); // keep last 30 days
  } catch { return []; }
}

function saveRecords(records: SessionRecord[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [records, setRecords] = useState<SessionRecord[]>(loadRecords);
  const intervalRef = useRef<number | null>(null);

  // Update document title for at-a-glance status
  useEffect(() => {
    if (running) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      document.title = `${MODE_LABELS[mode]} ${m}:${s.toString().padStart(2, "0")} — Launchpad`;
    } else {
      document.title = "Launchpad";
    }
    return () => { document.title = "Launchpad"; };
  }, [running, secondsLeft, mode]);

  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    setSecondsLeft(DURATIONS[newMode]);
    setRunning(false);
  }, []);

  const toggle = useCallback(() => {
    setRunning((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    setSecondsLeft(DURATIONS[mode]);
    setRunning(false);
  }, [mode]);

  const completeSession = useCallback(() => {
    if (mode !== "focus") {
      // Finished a break → switch to focus
      switchMode("focus");
      return;
    }
    // Finished a focus session → record it
    const today = getTodayStr();
    const next = [...records];
    const todayRecord = next.find((r) => r.date === today);
    if (todayRecord) todayRecord.count++;
    else next.push({ date: today, count: 1 });
    setRecords(next);
    saveRecords(next);
    setSessions((s) => s + 1);
    // Auto-switch to break
    const newSessions = sessions + 1;
    switchMode(newSessions % 4 === 0 ? "longBreak" : "shortBreak");
  }, [mode, records, sessions, switchMode]);

  // Tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Session complete
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          setRunning(false);
          // Defer to avoid setState-in-render warning
          setTimeout(completeSession, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [running, completeSession]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = 1 - secondsLeft / DURATIONS[mode];
  const todayCount = records.find((r) => r.date === getTodayStr())?.count ?? 0;

  // SVG ring
  const R = 52;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - progress);

  return (
    <div className="card-shadow card-shadow-hover col-span-1 rounded-[var(--radius-lg)] bg-paper dark:bg-paper-deep p-6 flex flex-col transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-ink dark:text-ink"><span className="h-3.5 w-[3px] rounded-full bg-accent" />番茄钟</h3>
        <span className="label-mono">今日 {todayCount}</span>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-ink-50/60 dark:bg-ink-800/20">
        {(Object.keys(DURATIONS) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all ${
              mode === m
                ? "bg-white dark:bg-ink-700/50 shadow-sm text-ink dark:text-ink"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="flex items-center justify-center py-2">
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke={MODE_COLORS[mode]}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 0.95s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[24px] font-light tabular-nums text-ink dark:text-ink leading-none">
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
            <span className="text-[9px] text-ink-faint mt-1">{MODE_LABELS[mode]}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button
          onClick={toggle}
          className="btn-micro px-5 py-2 rounded-lg text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: MODE_COLORS[mode] }}
        >
          {running ? "暂停" : "开始"}
        </button>
        <button
          onClick={reset}
          className="btn-micro px-3 py-2 rounded-lg text-[12px] font-medium text-ink-muted hover:bg-ink-100/40 dark:hover:bg-ink-800/30 transition-colors"
        >
          重置
        </button>
      </div>

      {/* Stats */}
      <div className="mt-4 pt-3 border-t border-line dark:border-line">
        <div className="flex items-center justify-between">
          <span className="label-mono">近 7 日</span>
          <span className="text-[10px] text-ink-faint">总计 {records.slice(-7).reduce((s, r) => s + r.count, 0)} 次</span>
        </div>
        <div className="flex items-end gap-1 mt-2 h-8">
          {Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            const dateStr = date.toISOString().slice(0, 10);
            const count = records.find((r) => r.date === dateStr)?.count ?? 0;
            const maxCount = Math.max(1, ...records.slice(-7).map((r) => r.count));
            const h = count > 0 ? Math.max(4, (count / maxCount) * 100) : 2;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm transition-all"
                  style={{
                    height: `${h}%`,
                    backgroundColor: count > 0 ? MODE_COLORS.focus : "var(--line)",
                    opacity: count > 0 ? 1 : 0.5,
                  }}
                  title={`${dateStr}: ${count} 次`}
                />
                <span className="text-[8px] text-ink-faint">
                  {date.toLocaleDateString("zh-CN", { weekday: "narrow" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
