"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { useSidebar } from "@/components/ui/sidebar";

/**
 * 壳级快捷键。
 *
 * 官方这些键挂在**原生菜单的 accelerator** 上（视图→显示/隐藏侧边栏 Ctrl+Shift+S 等），
 * 而 ARTEX 的菜单栏是自绘 DOM（与官方一致），所以加速键得由页面侧绑定 —— 这里集中一处，
 * 键位与菜单栏里显示的提示**逐条对齐**（codex-ui/shell/app-menu-bar.tsx 的 shortcut 字段）：
 *   Ctrl/Cmd+Shift+S  显示/隐藏侧边栏
 *   Ctrl/Cmd+N        新聊天
 *   Ctrl/Cmd+,        设置
 * 搜索的 Ctrl/Cmd+J 由 SearchDialog 自己绑定，不在这里重复。
 */
export function ShellShortcuts() {
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Ctrl+Shift+S：显示/隐藏侧边栏
      if (e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.shiftKey) return;
      // Ctrl+N：新聊天（Shift 版留给未来"临时聊天"，不抢）
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/chat/");
        return;
      }
      // Ctrl+,：设置
      if (e.key === ",") {
        e.preventDefault();
        router.push("/system/settings/");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, toggleSidebar]);

  return null;
}
