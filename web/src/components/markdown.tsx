"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "@/app/(main)/chat/_components/codex-chat.module.css";
import { CodeBlock } from "@/app/(main)/chat/_components/code-block";

// 元素级样式全部走官方 CSS-module 176oq 的换算值（见 codex-chat.module.css 的注释）。
// 这里只保留结构：无 typography 插件，逐元素给类名。
const components: Components = {
  // 标题由 .assistant h1..h4 统一控制 margin/字号/行高
  p: ({ node, ...p }) => <p {...p} />,
  ul: ({ node, ...p }) => <ul {...p} />,
  ol: ({ node, ...p }) => <ol {...p} />,
  li: ({ node, ...p }) => <li {...p} />,
  strong: ({ node, ...p }) => <strong style={{ fontWeight: "var(--font-weight-semibold, 600)" }} {...p} />,
  em: ({ node, ...p }) => <em {...p} />,
  a: ({ node, ...p }) => <a target="_blank" rel="noreferrer" {...p} />,
  hr: () => <hr />,
  blockquote: ({ node, ...p }) => <blockquote {...p} />,
  // 行内代码：官方 _InlineCode_（圆角 6px / 内边距 1px 6px / .92em / 等宽）
  code: ({ node, className, children, ...rest }) => {
    const block = /language-/.test(className || "");
    if (block) {
      // 块级代码由上面的 pre 接管；这里留一个兜底，避免裸 <code> 掉样式。
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={styles.inlineCode} {...rest}>
        {children}
      </code>
    );
  },
  // 代码块：官方 _CodeSurface_（顶部工具条 + 复制按钮 + 等宽正文）
  pre: ({ node, children }) => {
    const child = React.Children.toArray(children)[0];
    let language = "";
    let body: React.ReactNode = children;
    if (React.isValidElement(child)) {
      const props = child.props as { className?: string; children?: React.ReactNode };
      language = /language-([\w+-]+)/.exec(props.className || "")?.[1] ?? "";
      body = props.children;
    }
    return <CodeBlock language={language}>{body}</CodeBlock>;
  },
  table: ({ node, ...p }) => (
    <div className={styles.tableScroller}>
      <table className={styles.mdTable} {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th {...p} />,
  td: ({ node, ...p }) => <td {...p} />,
};

/**
 * Markdown 渲染消息正文。
 * streaming=true 时官方会给根节点打上 data-markdown-animated（逐块 fade-in，
 * 时长 --animation-duration-streaming-text = .7s）；这里用它挂动画类。
 */
export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const className = streaming ? `${styles.assistant} ${styles.enter}` : styles.assistant;
  return (
    <div className={className} data-markdown-animated={streaming ? "true" : undefined}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
