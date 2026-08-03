import { useState } from "react";
import { Icon } from "./icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { Settings } from "../types";
import { checkForUpdate } from "../lib/invoke";

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onRescan: () => void;
  onClose: () => void;
}

export function SettingsPanel({
  open,
  settings,
  onChange,
  onRescan,
  onClose,
}: Props) {
  const [updateMsg, setUpdateMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateMsg("");
    try {
      const info = await checkForUpdate();
      if (info && info.latestVersion && info.latestVersion !== info.currentVersion) {
        setUpdateMsg(`发现新版本 ${info.latestVersion}（当前 ${info.currentVersion}），请前往发布页升级`);
      } else {
        setUpdateMsg("已是最新版本");
      }
    } catch {
      setUpdateMsg("更新服务未配置（需在 tauri.conf.json 填写 pubkey 与更新地址）");
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={
          "fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />
      {/* sheet panel */}
      <aside
        className={
          "fixed right-0 top-0 z-40 flex h-full w-[340px] flex-col " +
          "border-l border-ink-200/40 " +
          "bg-white/90 backdrop-blur-2xl transition-transform duration-300 ease-out " +
          "dark:border-ink-700/40 dark:bg-ink-900/90 " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        {/* header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200/30 px-5 dark:border-ink-700/30">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent">
            <GearIcon />
          </span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold leading-tight text-ink-800 dark:text-ink-100">
              设置
            </div>
            <div className="text-[10px] text-ink-faint">个性化你的工作台</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="关闭">
            <Icon name="x" className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <Group title="外观">
            <ThemeSelect
              value={settings.theme}
              onChange={(v) => onChange({ ...settings, theme: v })}
            />
            <UsernameRow
              label="昵称"
              value={settings.userName}
              onChange={(v) => onChange({ ...settings, userName: v })}
            />
            <ToggleRow
              label="灰度图标"
              hint="以黑白风格显示所有应用图标"
              checked={settings.grayscaleIcons}
              onChange={(v) => onChange({ ...settings, grayscaleIcons: v })}
            />
          </Group>

          <Group title="窗口">
            <ToggleRow
              label="开机自动启动"
              hint="让它成为你打开电脑后第一个出现的工作入口"
              checked={settings.startWithWindows}
              onChange={(v) => onChange({ ...settings, startWithWindows: v })}
            />
            <ToggleRow
              label="窗口置顶"
              hint="让启动器始终保持在最前"
              checked={settings.alwaysOnTop}
              onChange={(v) => onChange({ ...settings, alwaysOnTop: v })}
            />
            <ToggleRow
              label="边缘磁吸"
              hint="拖动窗口靠近屏幕边缘时自动贴齐，像小组件一样停靠"
              checked={settings.edgeSnap}
              onChange={(v) => onChange({ ...settings, edgeSnap: v })}
            />
            <ToggleRow
              label="磁吸后自动隐藏"
              hint="贴到屏幕边缘后收成一条细边，鼠标碰到边缘会弹出"
              checked={settings.edgeAutoHide}
              onChange={(v) => onChange({ ...settings, edgeAutoHide: v })}
            />
            <ToggleRow
              label="最小化为迷你 Dock"
              hint="点击最小化时只显示最多 8 个置顶应用，而不是缩到任务栏"
              checked={settings.compactOnMinimize}
              onChange={(v) => onChange({ ...settings, compactOnMinimize: v })}
            />
            <Segmented
              label="迷你 Dock 方向"
              value={settings.compactOrientation}
              onChange={(v) => onChange({ ...settings, compactOrientation: v })}
            />
          </Group>

          <Group title="应用列表">
            <ToggleRow
              label="智能排序"
              hint="根据置顶、最近使用和打开次数自动调整应用顺序"
              checked={settings.smartSort}
              onChange={(v) => onChange({ ...settings, smartSort: v })}
            />
            <Button variant="outline" className="w-full" onClick={onRescan}>
              <RefreshIcon />
              重新扫描已安装应用
            </Button>
            <p className="text-[12px] leading-relaxed text-ink-400 dark:text-ink-500">
              扫描开始菜单中的快捷方式。新安装的应用可能需要重新扫描才会出现。
            </p>
          </Group>

          <Group title="关于">
            <div className="flex items-center gap-3 rounded-2xl bg-ink-50/50 p-3 dark:bg-ink-800/30">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">
                <LaunchpadMark />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-ink-800 dark:text-ink-100">
                  Launchpad
                </div>
                <div className="text-[11px] text-ink-400 dark:text-ink-500">
                  极简应用启动器 · 让桌面更干净
                </div>
              </div>
            </div>
          </Group>

          <Group title="更新">
            <div className="rounded-2xl bg-ink-50/60 p-3.5 dark:bg-ink-800/30">
              <button
                onClick={handleCheckUpdate}
                disabled={checking}
                className="w-full rounded-lg bg-accent py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {checking ? "检查中…" : "检查更新"}
              </button>
              {updateMsg && (
                <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-400 dark:text-ink-500">{updateMsg}</p>
              )}
            </div>
          </Group>
        </div>
      </aside>
    </>
  );
}

function UsernameRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-text items-center justify-between gap-3 rounded-2xl bg-ink-50/60 p-3.5 transition-colors hover:bg-ink-50 dark:bg-ink-800/30 dark:hover:bg-ink-800/40">
      <span className="flex-1">
        <span className="block text-[14px] font-medium text-ink-800 dark:text-ink-100">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-400 dark:text-ink-500">显示在侧边栏与仪表盘的昵称</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="你的名字"
        className="w-28 rounded-lg border border-ink-200/50 bg-white/70 px-2 py-1 text-[13px] text-ink-800 outline-none focus:ring-2 focus:ring-accent/40 dark:border-ink-700/50 dark:bg-ink-900/50 dark:text-ink-100"
      />
    </label>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
          {title}
        </span>
        <Separator className="ml-1 flex-1" />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function ThemeSelect({
  value,
  onChange,
}: {
  value: "system" | "light" | "dark";
  onChange: (v: "system" | "light" | "dark") => void;
}) {
  const options: { key: "system" | "light" | "dark"; label: string }[] = [
    { key: "system", label: "跟随系统" },
    { key: "light", label: "浅色" },
    { key: "dark", label: "深色" },
  ];
  return (
    <div className="rounded-2xl bg-ink-50/60 p-3.5 dark:bg-ink-800/30">
      <div className="mb-2.5 text-[13px] font-medium text-ink-800 dark:text-ink-100">
        主题
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/70 p-1 dark:bg-ink-900/50">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={
              "rounded-lg px-2 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97] " +
              (value === o.key
                ? "bg-accent text-white shadow-sm"
                : "text-ink-500 hover:bg-ink-100/70 dark:text-ink-400 dark:hover:bg-ink-800/70")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "horizontal" | "vertical";
  onChange: (v: "horizontal" | "vertical") => void;
}) {
  return (
    <div className="rounded-2xl bg-ink-50/60 p-3.5 dark:bg-ink-800/30">
      <div className="mb-2.5 text-[13px] font-medium text-ink-800 dark:text-ink-100">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/70 p-1 dark:bg-ink-900/50">
        {(["horizontal", "vertical"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              "rounded-lg px-2 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97] " +
              (value === v
                ? "bg-accent text-white shadow-sm"
                : "text-ink-500 hover:bg-ink-100/70 dark:text-ink-400 dark:hover:bg-ink-800/70")
            }
          >
            {v === "horizontal" ? "横向" : "竖向"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl bg-ink-50/60 p-3.5 transition-colors hover:bg-ink-50 dark:bg-ink-800/30 dark:hover:bg-ink-800/40">
      <span className="flex-1">
        <span className="block text-[14px] font-medium text-ink-800 dark:text-ink-100">
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-400 dark:text-ink-500">
            {hint}
          </span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

/* ── icons ── */
function GearIcon() {
  return (
    <Icon name="settings" className="w-4 h-4" />
  );
}
function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function LaunchpadMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
