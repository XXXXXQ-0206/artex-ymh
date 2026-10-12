"use client";

import * as React from "react";

import { usePathname } from "next/navigation";

import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================================
 * 设置页的面板导航（Codex Desktop 参考端实测，1280×816）
 *
 *   面板头   [52,44,288,96]  padding 0 8px
 *     h1「设置」18/600/24 @ [68,58]（= 8px 面板内边距 + 8px 行内缩进）
 *     搜索框  [60,96,272,36]  药丸 9999px / 底色 rgba(255,255,255,.08) /
 *                             padding 0 12px / gap 8 / input 14·430·18
 *   滚动区   [52,140,288,672] padding 4px 8px 8px
 *     分组标题行 [60,144,262,30] padding 0 6px 0 8px / 14·500·21 / 白 49.8%
 *     条目       [60,178,262,30] 圆角 12.5 / padding 5px 8px / 14·400·21 /
 *                                选中 bg rgba(255,255,255,.08)；条目步进 31px
 * ========================================================================== */

type Item = { id: string; label: string; group: string; target?: string };

const ITEMS: Item[] = [
  { id: "general", label: "常规", group: "个人", target: "traffic" },
  { id: "import", label: "导入", group: "个人", target: "panel" },
  { id: "appearance", label: "外观", group: "个人", target: "panel" },
  { id: "archived", label: "Archived chats", group: "个人", target: "panel" },
  { id: "voice", label: "语音", group: "个人", target: "sendkey" },
  { id: "configuration", label: "配置", group: "个人", target: "panel" },
  { id: "personalization", label: "个性化", group: "个人", target: "panel" },
  { id: "mini-pet", label: "Mini 与虚拟宠物", group: "个人", target: "panel" },
  { id: "shortcuts", label: "键盘快捷键", group: "个人", target: "sendkey" },
  { id: "plugins", label: "插件", group: "集成", target: "panel" },
  { id: "computer-control", label: "电脑操控", group: "集成", target: "panel" },
  { id: "browser", label: "浏览器", group: "集成", target: "websearch" },
  { id: "hooks", label: "钩子", group: "编码", target: "constraints" },
  { id: "connections", label: "连接", group: "编码", target: "proxy" },
  { id: "code-review", label: "代码审查", group: "编码", target: "panel" },
  { id: "git", label: "Git", group: "编码", target: "panel" },
  { id: "environment", label: "环境", group: "编码", target: "python" },
  { id: "worktrees", label: "Worktrees", group: "编码", target: "panel" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<string>(ITEMS[0].id);
  const activeRef = React.useRef(ITEMS[0].id);

  const setActiveItem = (id: string) => {
    activeRef.current = id;
    setActive(id);
  };

  // 滚动跟随：按页面中实际出现的锚点顺序取当前分区。
  // 到达滚动底部时，最后一个锚点可能无法顶到阈值，需显式选中它。
  React.useEffect(() => {
    if (!pathname?.startsWith("/system")) return;
    const scroller = document.querySelector("[data-codex-settings-scroll]") as HTMLElement | null;
    const onScroll = () => {
      const targets = [...new Set(ITEMS.map((item) => item.target ?? item.id))]
        .map((target) => ({ target, el: document.getElementById(target) }))
        .filter((entry): entry is { target: string; el: HTMLElement } => Boolean(entry.el))
        .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
      if (targets.length === 0) return;

      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        : false;
      const currentTarget = atBottom
        ? targets[targets.length - 1].target
        : [...targets].reverse().find(({ el }) => el.getBoundingClientRect().top <= 120)?.target ?? targets[0].target;
      const currentItem = ITEMS.find((item) => item.target === currentTarget)?.id ?? currentTarget;

      // 多个导航项可以指向同一设置卡片；用户点击其中一个后保持其 active 状态。
      if (ITEMS.find((item) => item.id === activeRef.current)?.target === currentTarget) return;
      setActiveItem(currentItem);
    };
    onScroll();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  // 静态导出下不能用 <a href="#id">（会整页跳转），自己滚动。
  const jump = (id: string) => {
    setActiveItem(id);
    const item = ITEMS.find((entry) => entry.id === id);
    // 直接定位可避免平滑滚动过程中的中间锚点覆盖用户刚点击的 active 状态。
    document.getElementById(item?.target ?? id)?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const q = query.trim().toLowerCase();
  const shown = ITEMS.filter((i) => !q || i.label.toLowerCase().includes(q));
  const groups = [...new Set(shown.map((i) => i.group))];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 面板头 96px：标题行 52px + 搜索框 36px + 底部 8px */}
      <div className="flex h-24 shrink-0 flex-col px-2">
        <div className="flex h-[52px] shrink-0 items-center ps-2">
          <h1 className="truncate font-semibold text-[18px] leading-6">设置</h1>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[rgb(255_255_255_/_0.08)] px-3">
          <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索"
            aria-label="搜索设置"
            className="w-full border-0 bg-transparent font-[430] text-[14px] leading-[18px] outline-none placeholder:text-[color:var(--color-text-tertiary)]"
          />
        </div>
      </div>

      {/* 滚动区 padding 4px 8px 8px */}
      <nav aria-label="设置导航" className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {groups.map((group) => (
          <div key={group} className="pb-2">
            <div className="mb-1 flex h-[30px] items-center ps-2 pe-1.5 font-medium text-[14px] text-[color:var(--color-text-tertiary)] leading-[21px]">
              {group}
            </div>
            <div className="flex flex-col gap-px">
              {shown
                .filter((i) => i.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jump(item.id)}
                    className={cn(
                      "flex h-[30px] w-full items-center rounded-[12.5px] px-2 py-[5px] text-left font-[430] text-[14px] leading-[21px] transition-colors duration-150 ease-[cubic-bezier(.19,1,.22,1)]",
                      active === item.id
                        ? "bg-[rgb(255_255_255_/_0.08)] text-foreground"
                        : "text-[color:var(--color-text-tertiary)] hover:bg-[rgb(255_255_255_/_0.05)]",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="px-2 py-3 text-[13px] text-[color:var(--color-text-tertiary)]">没有匹配的设置项</p>
        )}
      </nav>
    </div>
  );
}
