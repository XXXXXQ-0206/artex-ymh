"use client";

import * as React from "react";

import { CodexCheck, CodexCopy } from "@/components/icons/codex";

import styles from "./codex-chat.module.css";

// textOf 把 React 子树拍平成纯文本 —— 复制按钮需要的是原始代码。
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return textOf(props.children);
  }
  return "";
}

/**
 * CodeBlock 是官方 _CodeSurface_ + _StickyActionBar_ 的复刻：
 *   外框：--codeblock-background-color(--gray-25) 叠 --color-background-secondary-soft-alpha 渐变，
 *         圆角 --radius-2xl，corner-shape superellipse(1.1)；
 *   顶部工具条：12px 语言标签 + 28px 复制药丸（--spacing-token-button-composer）；
 *   正文：等宽字体 12px，line-height max(1.5em, 20px)（官方 _CodeContent_）。
 */
export function CodeBlock({ language, children }: { language?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = React.useMemo(() => textOf(children).replace(/\n$/, ""), [children]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板被拒（非安全上下文）时仍然给出视觉反馈，避免按钮看起来没反应。
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={styles.codeBlock} data-markdown-copy="code-block">
      <div className={styles.codeToolbar}>
        <span className={styles.codeLang}>{language || "text"}</span>
        <button
          type="button"
          className={styles.codeCopy}
          onClick={copy}
          aria-label={copied ? "已复制" : "复制代码"}
          title={copied ? "已复制" : "复制代码"}
        >
          {copied ? <CodexCheck size={14} /> : <CodexCopy size={14} />}
        </button>
      </div>
      <pre className={styles.codePre}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
