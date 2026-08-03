import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  theme?: "system" | "light" | "dark";
  onCycleTheme: () => void;
  onOpenSettings: () => void;
  onMinimize: () => void;
}

export function TitleBar({ theme = "system", onCycleTheme, onOpenSettings, onMinimize }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="no-context relative flex h-10 shrink-0 items-center justify-between px-3"
    >
      {/* Left: subtle settings icon + quick theme switcher */}
      <div className="flex items-center gap-1" data-no-drag>
        <button
          title="设置"
          onClick={onOpenSettings}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
        >
          <Icon name="settings" className="w-3.5 h-3.5" />
        </button>
        <button
          title={
            theme === "system" ? "主题：跟随系统（点击切换）"
              : theme === "dark" ? "主题：深色（点击切换）"
              : "主题：浅色（点击切换）"
          }
          onClick={onCycleTheme}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7")}
        >
          {theme === "dark" ? <Icon name="moon" className="w-3.5 h-3.5" /> : theme === "light" ? <Icon name="sun" className="w-3.5 h-3.5" /> : <Icon name="monitor" className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Center: empty drag region */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right: minimal window controls — single line stroke style */}
      <div className="flex items-center gap-1" data-no-drag>
        <WinBtn onClick={onMinimize} title="最小化">
          <Icon name="minus" className="w-2.5 h-2.5" />
        </WinBtn>
        <WinBtn
          onClick={() => getCurrentWindow().toggleMaximize()}
          title={maximized ? "还原" : "最大化"}
        >
          {maximized ? (
            <Icon name="copy" className="w-2.5 h-2.5" />
          ) : (
            <Icon name="square" className="w-2.5 h-2.5" />
          )}
        </WinBtn>
        <WinBtn
          onClick={() => getCurrentWindow().close()}
          title="关闭"
          danger
        >
          <Icon name="x" className="w-2.5 h-2.5" />
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "h-7 w-7",
        danger && "hover:bg-red-500/10 hover:text-red-500",
      )}
    >
      {children}
    </button>
  );
}

