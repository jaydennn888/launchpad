import { useState } from "react";
import { BUILTIN_PLUGINS, isPluginEnabled, setPluginEnabled, type Plugin } from "./registry";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";

/** Lightweight plugin manager modal: enable / disable built-in plugins.
 *  Future phases will load community plugins from an npm-backed market. */
export default function PluginManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-ink-200/30 dark:border-ink-700/40">
          <DialogTitle className="text-[15px] font-semibold">插件管理</DialogTitle>
          <DialogDescription className="text-[12px] text-ink-400 dark:text-ink-500">
            启停内置插件，按需求定制你的工作台
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {BUILTIN_PLUGINS.map((p: Plugin) => {
            const on = isPluginEnabled(p);
            return (
              <Card key={p.id} className="flex items-center gap-3 rounded-xl p-3 shadow-none">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  {p.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{p.name}</div>
                  <div className="truncate text-[12px] text-ink-muted">
                    {p.description}
                  </div>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(v) => { setPluginEnabled(p.id, v); rerender(); }}
                  aria-label={on ? "禁用" : "启用"}
                />
              </Card>
            );
          })}

          <div className="mt-2 rounded-xl border border-dashed border-ink-200/50 px-3 py-4 text-center text-[12px] text-ink-faint dark:border-ink-700/50">
            插件市场（即将上线）— 未来可从 npm 一键安装社区插件
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
