import { Icon } from "./icons";
import type { AppInfo } from "../types";
import { AppTile } from "./AppTile";

interface Props {
  apps: AppInfo[];
  pinnedIds: string[];
  grayscale: boolean;
  onLaunch: (app: AppInfo) => void;
  onTogglePin: (app: AppInfo) => void;
  onContext: (app: AppInfo, x: number, y: number) => void;
}

export function PinnedBar({
  apps,
  pinnedIds,
  grayscale,
  onLaunch,
  onTogglePin,
  onContext,
}: Props) {
  const pinned = pinnedIds
    .map((id) => apps.find((a) => a.id === id))
    .filter((a): a is AppInfo => Boolean(a));

  if (pinned.length === 0) {
    return (
      <div className="px-6 pt-1 pb-4">
        <SectionLabel>常用 · 0/10</SectionLabel>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-ink-200/50 px-4 py-3 text-ink-400 dark:border-ink-700/40 dark:text-ink-500">
          <Icon name="pin" className="w-[18px] h-[18px]" />
          <span className="text-[12.5px]">
            右键点击应用选择「置顶」，常用应用将显示在这里
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-1 pb-4">
      <SectionLabel>常用 · {pinned.length}/10</SectionLabel>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {pinned.map((app) => (
          <AppTile
            key={app.id}
            app={app}
            pinned
            grayscale={grayscale}
            size="lg"
            onLaunch={onLaunch}
            onTogglePin={onTogglePin}
            onContext={onContext}
          />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 px-1">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400 dark:text-ink-500">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-ink-200/40 to-transparent dark:from-ink-700/40" />
    </div>
  );
}
