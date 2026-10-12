"use client";

/**
 * 宿主驱动的导航：把 `codex-host:navigate` 接到应用路由。
 *
 * 为什么单独一个组件：根布局是 server component，`<CodexHostBridge />` 只能拿默认选项；
 * 而「跳哪个路由」只有应用自己知道（Next Router）。外壳的导轨/菜单在托管态下用这条通道
 * 驱动本控制台（对话 / 任务 / 发现 / 内网 / 设置），外壳自己的地址不动（恒为 /artex）。
 *
 * 未托管时整条桥是惰性的（见 host-client 的 isBridgeEnabled）：这里只是多挂一个 no-op。
 */

import { useRouter } from "next/navigation";

import { CodexHostBridge } from "./host-client";

export function CodexHostNavBridge() {
  const router = useRouter();
  return (
    <CodexHostBridge
      onNavigate={(path) => {
        router.push(path);
      }}
    />
  );
}
