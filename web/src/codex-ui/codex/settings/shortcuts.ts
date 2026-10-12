/**
 * [控制台逐字节移植] 本文件是壳 `src/settings/shortcuts.ts` 的**纯函数子集**。
 *
 * 为什么不是整份复制：壳那个文件在模块作用域 import 了
 *   · react-router-dom（useNavigate）
 *   · ./nav-model（内含 @/icons 等壳专属资产）
 * 控制台两条依赖都不存在，整份搬进来连 tsc 都过不了。
 * 这里只保留 `controls.tsx` 真正用到的 `normalizeChord`，**函数体逐字节相同**
 * （含 JSDoc），所以 `controls.tsx` 的 `import { normalizeChord } from "./shortcuts";` 一行都不用改。
 */

/** 把 KeyboardEvent 归一成官方文案口径的 chord 字符串（Ctrl+Shift+S / F11 / Ctrl+`） */
export function normalizeChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  const key = event.key;
  const isModifierOnly = ["Control", "Alt", "Shift", "Meta"].includes(key);
  if (isModifierOnly) return parts.join("+");

  const map: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    " ": "Space",
    Escape: "Esc",
    Enter: "Enter",
    "+": "=",
  };
  let label = map[key] ?? key;
  if (label.length === 1 && event.shiftKey && /[a-zA-Z]/.test(label)) label = label.toUpperCase();
  parts.push(label);
  return parts.join("+");
}
