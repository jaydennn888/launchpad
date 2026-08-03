import { Icon } from "./icons";
import { memo, useState, useEffect } from "react";
import type { AppInfo } from "../types";

interface Props {
  app: AppInfo;
  pinned: boolean;
  grayscale: boolean;
  size?: "sm" | "lg";
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
}

function AppTileBase({
  app,
  pinned,
  grayscale,
  size = "sm",
  onLaunch,
  onTogglePin,
  onContext,
}: Props) {
  const large = size === "lg";
  const [imgError, setImgError] = useState(false);

  useEffect(() => { setImgError(false); }, [grayscale, app.icon]);

  const box = large ? "h-[84px] w-[84px]" : "h-[72px] w-[72px]";
  const radius = large ? "rounded-[22%]" : "rounded-[20%]";
  const nameSize = large ? "text-[12px]" : "text-[12px]";
  const tileW = large ? "w-[104px]" : "w-[100px]";

  return (
    <div
      className={`tile group relative flex flex-col items-center gap-2 rounded-2xl px-1 py-2.5 ${tileW} cursor-pointer text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-100/40 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:bg-ink-800/30 dark:hover:shadow-black/20`}
      title={app.name}
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        const payload = JSON.stringify({ kind: "app", app });
        e.dataTransfer.setData("text/plain", payload);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onLaunch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(app, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLaunch(app);
        }
      }}
    >
      {/* Pin toggle on hover */}
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(app);
        }}
        title={pinned ? "取消置顶" : "置顶"}
        className={`absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full opacity-0 transition-all group-hover:opacity-100 hover:bg-ink-100/60 dark:hover:bg-ink-800/50 ${pinned ? "opacity-100 text-ink dark:text-ink" : "text-ink-faint"}`}
      >
        <Icon name="pin" className="w-2.5 h-2.5" />
      </span>

      {/* Icon container */}
      <div className={`relative grid shrink-0 place-items-center ${box} ${radius} bg-transparent`}>
        {app.icon && !imgError ? (
          <img
            src={app.icon}
            alt=""
            draggable={false}
            onError={() => setImgError(true)}
            className="h-full w-full object-contain"
            style={{
              filter: grayscale ? "grayscale(1) contrast(1.05)" : undefined,
              imageRendering: "-webkit-optimize-contrast",
            }}
          />
        ) : (
          <LetterAvatar name={app.name} className={box} />
        )}
      </div>

      <span className={`line-clamp-2 max-w-full break-words leading-[1.3] tracking-[0.005em] text-ink-muted dark:text-ink-muted font-medium ${nameSize}`}>
        {app.name}
      </span>
    </div>
  );
}

export function LetterAvatar({ name, className }: { name: string; className: string }) {
  const ch = name.trim().charAt(0).toUpperCase() || "?";
  const palette = [
    "from-[#ff6b6b] to-[#ee5a52]",
    "from-[#4ecdc4] to-[#26a69a]",
    "from-[#ffd93d] to-[#f6a609]",
    "from-[#6c5ce7] to-[#5641e2]",
    "from-[#a29bfe] to-[#6c5ce7]",
    "from-[#fd79a8] to-[#e84393]",
    "from-[#00b894] to-[#00a884]",
    "from-[#0984e3] to-[#0768b3]",
    "from-[#fdcb6e] to-[#f39c12]",
    "from-[#fab1a0] to-[#e17055]",
  ];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span
      className={`letter-avatar h-full w-full bg-gradient-to-br text-white ${palette[idx]} ${className}`}
      style={{ fontSize: 18, borderRadius: "inherit" }}
    >
      {ch}
    </span>
  );
}

export const AppTile = memo(AppTileBase);
