"use client";

import * as React from "react";

import Link from "next/link";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { InterceptRule } from "@/lib/types";

/**
 * 输入区工具行左侧的「权限位」。
 *
 * 官方在这个位置放的是「完全访问 / 更改权限」药丸（13px·430·28px 高·9999px 圆角，
 * 语义是沙箱/权限模式，放开时用橙色）。ARTEX 没有会话级权限模式，
 * 但有**真实**的拦截规则（拦截规则命中后 allow/deny/ask）——所以这里渲染真实的拦截姿态：
 *   · 没有启用任何规则 ⇒ 橙色「拦截已关闭 · 完全放开」（与官方"完全访问=橙"同构，
 *     因为它确实是"不再拦"的放开态）；
 *   · 有 N 条启用 ⇒ 次要色「拦截 · N 条规则」。
 * 药丸可点开列出启用的规则，并给出「管理拦截规则」入口（/system/intercept/）。
 * 数据全部来自 `/api/intercept/rules`，不造假值。
 */
export function PermissionPill({ className }: { className?: string }) {
  const [rules, setRules] = React.useState<InterceptRule[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .interceptRules()
        .then((list) => {
          if (alive) setRules(list ?? []);
        })
        .catch(() => {
          if (alive) setRules([]);
        });
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const enabled = (rules ?? []).filter((r) => r.enabled);
  const loading = rules === null;
  const open = enabled.length === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[13px] leading-[18px] font-normal",
            "transition-colors hover:bg-[rgb(255_255_255_/_0.08)]",
            open ? "text-[rgb(255_133_73)]" : "text-[color:var(--color-text-tertiary,rgb(255_255_255_/_0.498))]",
            className,
          )}
          title="拦截规则姿态"
          aria-label="拦截规则姿态"
        >
          {loading ? "拦截 · 读取中" : open ? "拦截已关闭 · 完全放开" : `拦截 · ${enabled.length} 条规则`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1 pb-1.5 text-[13px] font-medium">
          {loading ? "读取拦截规则…" : open ? "当前没有任何启用的拦截规则" : `已启用 ${enabled.length} 条拦截规则`}
        </p>
        {enabled.length > 0 && (
          <ul className="max-h-56 overflow-y-auto pb-1">
            {enabled.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded px-1 py-1 text-[13px]">
                <span className="truncate">{r.name || r.pattern || `规则 #${r.id}`}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-[12px]">
                  {r.action === "deny" ? "拒绝" : r.action === "allow" ? "放行" : "询问"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/system/intercept/"
          className="text-muted-foreground hover:text-foreground block rounded px-1 pt-1.5 text-[13px]"
        >
          管理拦截规则 →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
