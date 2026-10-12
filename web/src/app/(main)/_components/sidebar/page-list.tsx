"use client";

import * as React from "react";

import Link from "next/link";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * 「面板即列表」——Codex 的页面范式。
 *
 * 官方在 /scheduled 这类页面里，288px 面板**不是**全站导航，而是**当前页的列表**：
 *   面板头 52px：标题 18px/600（+ 右侧图标按钮）
 *   主操作行：[60,96,272,30] 圆角 12.5px、底色白 8%、文字 14px/430 白 85%
 *   列表行 [60,168,272,·]：标题 14px/430 白 85%（行高 20）+ 副行 12px/430 白 49.8%（行高 16），
 *                          行距 44px、hover 白 4%、选中白 8%
 * 出处：外壳工程 /scheduled 实测（同一套 token 与几何），见 outputs 的对照截图。
 *
 * 用法：页面里 <PageListPortal …/> 把它 portal 进面板插槽（#page-list-slot），
 * 同时通过 data-page-list 让面板隐藏全站导航（见 codex-shell.css）。
 */
export interface PageListItem {
  key: string;
  title: string;
  meta?: string;
  href?: string;
  active?: boolean;
}

function Row({ item }: { item: PageListItem }) {
  const body = (
    <>
      <span className="truncate text-[14px] leading-5 text-[color:var(--codex-text-strong)]">{item.title}</span>
      {item.meta ? (
        <span className="truncate text-[12px] leading-4 text-[color:var(--codex-text-secondary)]">{item.meta}</span>
      ) : null}
    </>
  );
  const cls = cn(
    "flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-[10px] px-2 py-1.5",
    "hover:bg-[rgb(255_255_255_/_0.04)]",
    item.active && "bg-[rgb(255_255_255_/_0.08)]",
  );
  if (!item.href) {
    return (
      <div className={cls} title={item.title}>
        {body}
      </div>
    );
  }
  return (
    <Link prefetch={false} href={item.href} className={cls} title={item.title}>
      {body}
    </Link>
  );
}

export function PageList({
  title,
  action,
  items,
  empty = "暂无内容",
}: {
  title: string;
  action?: React.ReactNode;
  items: PageListItem[];
  empty?: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[52px] shrink-0 items-center px-2">
        <h1 className="truncate text-[18px] leading-6 font-semibold text-[color:var(--codex-text-strong)]">{title}</h1>
      </div>
      {action ? <div className="shrink-0 px-2 pb-2">{action}</div> : null}
      <nav aria-label={`${title}列表`} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-[color:var(--codex-text-secondary)]">{empty}</p>
        ) : (
          <div className="flex flex-col gap-0">
            {items.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}

/**
 * 把 PageList 挂进 288px 面板的插槽，并在挂载期间打开 `data-page-list`（隐藏全站导航）。
 * 面板插槽可能比页面晚挂载（外壳先渲染），所以用一次 rAF + 短轮询兜住。
 */
export function PageListPortal(props: React.ComponentProps<typeof PageList>) {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const find = () => {
      const el = document.getElementById("page-list-slot");
      if (el) setSlot(el);
    };
    find();
    const timer = window.setInterval(find, 400);
    document.documentElement.dataset.pageList = "on";
    return () => {
      window.clearInterval(timer);
      delete document.documentElement.dataset.pageList;
    };
  }, []);

  if (!slot) return null;
  return createPortal(<PageList {...props} />, slot);
}
