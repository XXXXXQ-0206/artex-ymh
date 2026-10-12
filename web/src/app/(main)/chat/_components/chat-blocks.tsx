"use client";

import * as React from "react";

import {
  CodexAlertTriangle,
  CodexCheck,
  CodexChevronDown,
  CodexChevronRight,
  CodexCopyMessage,
  CodexEditMessage,
  CodexFileDoc,
} from "@/components/icons/codex";
import { Markdown } from "@/components/markdown";

import styles from "./codex-chat.module.css";

function fmtBytes(n: number): string {
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`;
  return `${n} B`;
}

export type MsgAttachment = { name: string; path: string; size: number };

/** AttachmentChip 复刻消息里的附件条：圆角 --radius-md、1px --color-border、12px。 */
export function AttachmentChip({ file }: { file: MsgAttachment }) {
  return (
    <div className={styles.attachmentChip} title={file.path}>
      <CodexFileDoc size={12} />
      <span className={styles.attachmentChipName}>{file.name}</span>
      <span className={styles.attachmentChipMeta}>{fmtBytes(file.size)}</span>
    </div>
  );
}

/**
 * UserMessage 是右对齐的用户气泡：官方 --color-background-user-message =
 * color-mix(in oklab, var(--color-text) 5%, transparent)，圆角 --radius-2xl。
 */
export function UserMessage({
  text,
  attachments,
  pending,
  ts,
}: {
  text: string;
  attachments?: MsgAttachment[];
  pending?: boolean;
  ts?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
      /* 剪贴板不可用时仍然给出反馈 */
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }
  const date = ts ? new Date(ts) : null;
  const valid = date && !Number.isNaN(date.getTime());
  return (
    <div className={styles.userRow}>
      {attachments && attachments.length > 0 && (
        <div className={styles.msgAttachments}>
          {attachments.map((a) => (
            <AttachmentChip key={a.path} file={a} />
          ))}
        </div>
      )}
      {text ? (
        <div className={styles.userBubble} data-pending={pending ? "true" : undefined}>
          {text}
        </div>
      ) : null}
      {/* 参考端：气泡下方一条 gap-1 的行，时间戳 + 复制/编辑图标，默认 opacity:0 */}
      <div className={styles.userActions}>
        {valid && (
          <span className={styles.msgTime}>
            {date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
        <button
          type="button"
          className={styles.userAction}
          onClick={copy}
          aria-label={copied ? "已复制消息" : "复制消息"}
          title={copied ? "已复制" : "复制消息"}
        >
          {copied ? <CodexCheck size={14} /> : <CodexCopyMessage size={14} />}
        </button>
        <button type="button" className={styles.userAction} aria-label="编辑消息" title="编辑消息">
          <CodexEditMessage size={14} />
        </button>
      </div>
    </div>
  );
}

/** AssistantMessage 无气泡、直接排版（官方 _MarkdownRoot_：16px / 行高 24 / 字重 430）。 */
export function AssistantMessage({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={styles.turn}>
      <Markdown text={text} streaming={streaming} />
      {streaming && <span className={styles.cursor} />}
    </div>
  );
}

/** 错误态：官方 --color-text-danger + 40% 红边。 */
export function ErrorBlock({ text }: { text: string }) {
  return (
    <div className={styles.errorBlock} role="alert">
      <CodexAlertTriangle size={14} className={styles.errorIcon} />
      <span>{text}</span>
    </div>
  );
}

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.collapsible} data-open={open ? "true" : "false"}>
      <div className={styles.collapsibleInner}>{children}</div>
    </div>
  );
}

/**
 * ReasoningBlock 是折叠的「推理」块：折叠行 13px·430 次要色 + chevron，
 * 展开体用 --color-text-tertiary 的 16/24 正文。
 */
export function ReasoningBlock({
  text,
  streaming,
  defaultOpen = false,
}: {
  text: string;
  streaming?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const summary = firstLine.length > 90 ? `${firstLine.slice(0, 90)}…` : firstLine || "推理中…";
  return (
    <div className={styles.reasoning}>
      <button
        type="button"
        className={styles.reasoningToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <CodexChevronDown size={12} /> : <CodexChevronRight size={12} />}
        <span className={styles.reasoningSummary}>
          {streaming ? "正在推理…" : "推理"}
          {!streaming && summary ? `：${summary}` : ""}
        </span>
      </button>
      <Collapsible open={open}>
        <div className={styles.reasoningBody}>{text}</div>
      </Collapsible>
    </div>
  );
}

/**
 * ToolCallBlock 复刻工具调用块：折叠行「工具名 + 命令 + 状态」，展开体是等宽输出。
 * 状态色用官方语义色（info/成功/失败）。
 */
export function ToolCallBlock({
  tool,
  command,
  output,
  running,
  isError,
  defaultOpen = false,
}: {
  tool: string;
  command?: string;
  output?: string | null;
  running?: boolean;
  isError?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const status = running ? "执行中" : isError ? "失败" : "完成";
  const tone = running ? styles.toolRunning : isError ? styles.toolFail : styles.toolOk;
  return (
    <div className={styles.toolCall}>
      <button
        type="button"
        className={styles.toolToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <CodexChevronDown size={12} /> : <CodexChevronRight size={12} />}
        <span className={styles.toolName}>{tool}</span>
        {command ? <span className={styles.toolCmd}>{command}</span> : <span className={styles.toolCmd} />}
        <span className={`${styles.toolStatus} ${tone}`}>{status}</span>
      </button>
      <Collapsible open={open}>
        <pre className={styles.toolBody}>{output ?? (running ? "运行中…" : "（无输出）")}</pre>
      </Collapsible>
    </div>
  );
}

/**
 * MsgMeta 是消息下方的时间戳行：参考端默认 opacity:0，hover / focus-within 才显形，
 * 12px / 次要色 / 等宽数字。
 */
export function MsgMeta({ ts }: { ts?: string }) {
  const date = ts ? new Date(ts) : null;
  const valid = date && !Number.isNaN(date.getTime());
  return (
    <div className={styles.msgMeta}>
      {valid && (
        <time dateTime={date.toISOString()} title={date.toLocaleString("zh-CN")} className={styles.msgTime}>
          {date.toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
      )}
    </div>
  );
}

/** 轮次分隔（planner round）。 */
export function RoundDivider({ label }: { label: string }) {
  return <div className={styles.roundDivider}>{label}</div>;
}

/** 空态。 */
export function ChatEmpty({ text }: { text: string }) {
  return <div className={styles.emptyState}>{text}</div>;
}

/** 加载骨架：三条 12px 药丸占位，官方 reduced-motion 下停止动画。 */
export function ChatSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
    </div>
  );
}
