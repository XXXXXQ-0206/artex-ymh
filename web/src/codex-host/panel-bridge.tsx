"use client";

import * as React from "react";

import { isHostToGuestMessage } from "./protocol";

/**
 * `codex-host:panel` — 外壳 36px 菜单栏左簇那个 28×28 的「显示/隐藏侧边栏」开关，在托管档下
 * 必须作用到**访客自己的 288px 面板**。
 *
 * 为什么单独一个组件（与 nav-bridge 同一个理由）：面板的开关状态只有应用自己的
 * `useSidebar()` 知道，而消息本身的解包属于宿主桥的协议层。把它放在 (main) 的 embedded 分支里，
 * 就有 `useSidebar()` 可用；独立打开时整条链是惰性的（isEmbedded() 为 false，不装监听）。
 *
 * 为什么自带监听而不是走 host-client 的 options 回调：host-client 是"一个窗口一份"的长生命周期
 * 客户端，它的 options 在挂载时被冻进 ref（见 useCodexHost 的注释）——在那里加回调意味着组件
 * 重渲染不会更新 handler，反而要再引入一层可变引用。这里自己过滤一遍，代价是多一次
 * `isHostToGuestMessage` 调用，换来的是"谁需要谁自己订阅"，且不触碰 host-client 的出站路径
 * （出站 targetOrigin 的缺陷正在单独修，两个改动不该互相压版本）。
 *
 * 安全：入站守卫沿 host-client 的两条规矩 —— 只认结构化信封（协议 guard，含 channel/v/type），
 * 且**只认直接嵌入者**（`event.source === window.parent`）。同源的兄弟帧即使拿到本窗口句柄，
 * 也会在 source 这一步被丢掉。
 */
export function CodexHostPanelBridge({ onToggle }: { onToggle: () => void }) {
  // handler 每次渲染都可能是新的（toggleSidebar 来自 context），用 ref 取值，
  // 免得每渲染一次就拆装一遍监听。
  const handlerRef = React.useRef(onToggle);
  React.useEffect(() => {
    handlerRef.current = onToggle;
  }, [onToggle]);

  React.useEffect(() => {
    if (!isEmbedded()) return;
    const onMessage = (event: MessageEvent) => {
      try {
        // 只有直接嵌入者能驱动本窗口（与 host-client 的 isFromHost 同一条不变量）。
        if (event.source !== window.parent) return;
        if (!isHostToGuestMessage(event.data)) return;
        if (event.data.type !== "codex-host:panel") return;
        handlerRef.current();
      } catch {
        // 监听器里的异常在宿主页面里是不可见的，按桥的规矩一律吞掉。
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}

/** 被别人的文档托着吗？跨源访问 window.top 被拒也说明是。 */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
