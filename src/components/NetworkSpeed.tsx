import { useEffect, useState, useCallback, useRef } from "react";
import type { NetworkSpeed as NetworkSpeedType } from "../types";
import { getNetworkSpeed } from "../lib/invoke";

const MAX_POINTS = 20;

export default function NetworkSpeedWidget() {
  const [speed, setSpeed] = useState<NetworkSpeedType | null>(null);
  const [history, setHistory] = useState<{ up: number; down: number }[]>([]);
  const [maxVal, setMaxVal] = useState(100);

  const fetchSpeed = useCallback(async () => {
    try {
      const s = await getNetworkSpeed();
      setSpeed(s);
      setHistory((prev) => {
        const next = [...prev, { up: s.uploadKbps, down: s.downloadKbps }];
        if (next.length > MAX_POINTS) next.shift();
        return next;
      });
      // Dynamic scale
      const all = [s.uploadKbps, s.downloadKbps, ...history.flatMap((h) => [h.up, h.down])];
      const peak = Math.max(...all, 10);
      setMaxVal((prev) => {
        const target = Math.ceil(peak / 50) * 50;
        return target > prev ? target : prev > target * 2 ? Math.max(target, 50) : prev;
      });
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    fetchSpeed();
    const timer = setInterval(fetchSpeed, 2000);
    return () => clearInterval(timer);
  }, [fetchSpeed]);

  const formatSpeed = (kbps: number) => {
    if (kbps > 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
    return `${Math.round(kbps)} KB/s`;
  };

  const upColor = "#f59e0b";
  const downColor = "#0d9488";

  // Build SVG path for a given data array
  const buildPath = (data: number[], height: number, width: number) => {
    if (data.length < 2) return "";
    const step = width / (MAX_POINTS - 1);
    const points = data.map((val, i) => {
      const x = i * step;
      const y = height - (val / maxVal) * height;
      return `${x},${Math.max(0, Math.min(height, y))}`;
    });
    return `M ${points.join(" L ")}`;
  };

  const chartH = 48;
  const chartW = 200;

  const upPath = buildPath(
    history.map((h) => h.up),
    chartH,
    chartW
  );
  const downPath = buildPath(
    history.map((h) => h.down),
    chartH,
    chartW
  );

  return (
    <div className="col-span-1 rounded-2xl bg-white/50 dark:bg-ink-800/30 backdrop-blur border border-ink-200/20 dark:border-ink-700/20 p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50 mb-3">网速监控</h3>

      {/* Speed values */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl bg-accent/5 dark:bg-accent/10 p-2.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </svg>
            <span className="text-[10px] text-accent dark:text-accent">下载</span>
          </div>
          <p className="text-xs font-semibold text-ink-800 dark:text-ink-200 tabular-nums">
            {speed ? formatSpeed(speed.downloadKbps) : "--"}
          </p>
        </div>
        <div className="rounded-xl bg-amber-500/5 dark:bg-amber-500/10 p-2.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <svg className="w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            <span className="text-[10px] text-amber-600 dark:text-amber-400">上传</span>
          </div>
          <p className="text-xs font-semibold text-ink-800 dark:text-ink-200 tabular-nums">
            {speed ? formatSpeed(speed.uploadKbps) : "--"}
          </p>
        </div>
      </div>

      {/* Mini chart */}
      <div className="flex-1 min-h-0 relative">
        {history.length < 2 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[10px] text-ink-400 dark:text-ink-500">采集数据中...</p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((pct) => (
              <line
                key={pct}
                x1="0"
                y1={chartH * pct}
                x2={chartW}
                y2={chartH * pct}
                stroke="currentColor"
                strokeOpacity="0.08"
                className="text-ink-500"
                strokeWidth="0.5"
              />
            ))}
            {/* Download line */}
            {downPath && (
              <path
                d={downPath}
                fill="none"
                stroke={downColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            )}
            {/* Upload line */}
            {upPath && (
              <path
                d={upPath}
                fill="none"
                stroke={upColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            )}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-[9px] text-ink-400 dark:text-ink-500">下载</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[9px] text-ink-400 dark:text-ink-500">上传</span>
        </div>
      </div>
    </div>
  );
}
