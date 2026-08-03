import { useEffect, useRef } from "react";
import type { AppInfo } from "../types";

interface Props {
  app: AppInfo;
  pinned: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onReveal: (app: AppInfo) => void;
  onDelete: (app: AppInfo) => void;
}

export function ContextMenu({
  app,
  pinned,
  x,
  y,
  onClose,
  onLaunch,
  onTogglePin,
  onReveal,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // keep menu inside the viewport
  const adjusted = adjust(x, y, 184, 210);

  const run = (fn: (a: AppInfo) => void) => () => {
    fn(app);
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ left: adjusted.x, top: adjusted.y }}
      onClick={(e) => e.stopPropagation()}
      className="animate-pop fixed z-50 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-md backdrop-blur-xl"
    >
      <Item onClick={run(onLaunch)}>
        <IconOpen /> 打开
      </Item>
      <Item onClick={run(onTogglePin)}>
        <IconPin /> {pinned ? "取消置顶" : "置顶到常用"}
      </Item>
      <Item onClick={run(onReveal)}>
        <IconFolder /> 打开文件位置
      </Item>
      <div className="my-1 h-px bg-ink-200/30 dark:bg-ink-700/30" />
      <Item danger onClick={run(onDelete)}>
        <IconTrash /> 删除
      </Item>
    </div>
  );
}

function adjust(x: number, y: number, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: x + w > vw ? vw - w - 8 : x,
    y: y + h > vh ? vh - h - 8 : y,
  };
}

function Item({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors " +
        (danger
          ? "text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
          : "text-popover-foreground hover:bg-accent/10 hover:text-accent")
      }
    >
      {children}
    </button>
  );
}

const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function IconOpen() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...s}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...s}>
      <path d="M12 17v5" />
      <path d="M9 10.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6.5l2 3.5H7l2-3.5z" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...s}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...s}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
