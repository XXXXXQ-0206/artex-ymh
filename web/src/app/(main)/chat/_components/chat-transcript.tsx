"use client";

import * as React from "react";

import type { Activity } from "@/lib/types";

import {
  AssistantMessage,
  ChatEmpty,
  ErrorBlock,
  type MsgAttachment,
  MsgMeta,
  ReasoningBlock,
  RoundDivider,
  ToolCallBlock,
  UserMessage,
} from "./chat-blocks";
import styles from "./codex-chat.module.css";

type Group =
  | { type: "user"; key: number; step: Activity; intent?: boolean }
  | { type: "answer"; key: number; step: Activity }
  | { type: "round"; key: number; label: string }
  | { type: "tool"; key: number; use?: Activity; result?: Activity }
  | { type: "reasoning"; key: number; steps: Activity[] }
  | { type: "intercept"; key: number; step: Activity };

/**
 * groupChat 把 activity 流折叠成「对话消息」：
 *   - user/intent → 右侧用户气泡
 *   - thinking（连续、同 worker）→ 一个折叠推理块
 *   - tool_use + tool_result（按 tool_use_id 配对）→ 工具调用块
 *   - text/result → 助手 markdown 正文（无气泡）
 *   - round → 轮次分隔线
 */
function groupChat(steps: Activity[]): Group[] {
  const out: Group[] = [];
  const byToolId = new Map<string, Extract<Group, { type: "tool" }>>();
  for (const s of steps) {
    if (s.kind === "usage") continue;
    if (s.kind === "round") {
      out.push({ type: "round", key: s.seq, label: s.summary || "新一轮" });
      continue;
    }
    if (s.kind === "intercept_request") {
      out.push({ type: "intercept", key: s.seq, step: s });
      continue;
    }
    if (s.kind === "user" || s.kind === "intent") {
      out.push({ type: "user", key: s.seq, step: s, intent: s.kind === "intent" });
      continue;
    }
    if (s.kind === "tool_use") {
      const g: Extract<Group, { type: "tool" }> = { type: "tool", key: s.seq, use: s };
      if (s.tool_use_id) byToolId.set(s.tool_use_id, g);
      out.push(g);
      continue;
    }
    if (s.kind === "tool_result") {
      const g = s.tool_use_id ? byToolId.get(s.tool_use_id) : undefined;
      if (g && !g.result) g.result = s;
      else out.push({ type: "tool", key: s.seq, result: s });
      continue;
    }
    if (s.kind === "thinking") {
      const last = out[out.length - 1];
      if (last && last.type === "reasoning") last.steps.push(s);
      else out.push({ type: "reasoning", key: s.seq, steps: [s] });
      continue;
    }
    if (s.kind === "result" || s.kind === "text") {
      // 助手正文：连续的 text/result 合并成一段 markdown（流式时增量拼接）
      const last = out[out.length - 1];
      if (last && last.type === "answer" && last.step.worker === s.worker && s.kind === "text") {
        last.step = { ...last.step, summary: `${last.step.summary}${s.summary}`, seq: s.seq };
      } else {
        out.push({ type: "answer", key: s.seq, step: s });
      }
      continue;
    }
    // 其它 kind（error / 自定义）当作助手文本块
    out.push({ type: "answer", key: s.seq, step: s });
  }
  return out;
}

/** useInView 延迟加载长正文（打开长线程时不为每条消息发详情请求）。 */
function useInView(rootMargin = "400px"): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const root = el.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { root, rootMargin },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

function parseUserBody(body: string): { text: string; attachments: MsgAttachment[] } {
  if (body.startsWith("{")) {
    try {
      const p = JSON.parse(body);
      if (p && Array.isArray(p.attachments)) {
        return { text: typeof p.text === "string" ? p.text : "", attachments: p.attachments };
      }
    } catch {
      /* 纯文本恰好以 { 开头 */
    }
  }
  return { text: body, attachments: [] };
}

function UserTurn({
  step,
  getDetail,
  ts,
}: {
  step: Activity;
  getDetail: (seq: number) => Promise<string>;
  ts?: string;
}) {
  const [ref, inView] = useInView();
  const inline = step.detail && step.detail.length > 0 ? step.detail : null;
  const [full, setFull] = React.useState<string | null>(inline);
  React.useEffect(() => {
    if (inline || !inView) return;
    let live = true;
    getDetail(step.seq)
      .then((d) => {
        if (live) setFull(d || step.summary);
      })
      .catch(() => {
        if (live) setFull(step.summary);
      });
    return () => {
      live = false;
    };
  }, [inView, step.seq, step.summary, inline, getDetail]);
  const { text, attachments } = parseUserBody(full ?? step.summary);
  return (
    <div ref={ref} className={styles.turn}>
      <UserMessage text={text} attachments={attachments} ts={ts ?? step.ts} />
    </div>
  );
}

function AnswerTurn({ step, getDetail, streaming }: { step: Activity; getDetail: (seq: number) => Promise<string>; streaming?: boolean }) {
  const [ref, inView] = useInView();
  const [full, setFull] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!inView) return;
    let live = true;
    getDetail(step.seq)
      .then((d) => {
        if (live) setFull(d || step.summary);
      })
      .catch(() => {
        if (live) setFull(step.summary);
      });
    return () => {
      live = false;
    };
  }, [inView, step.seq, step.summary, getDetail]);
  const body = full ?? step.summary;
  if (step.is_error) return <ErrorBlock text={body} />;
  return (
    <div ref={ref} className={styles.turn}>
      <AssistantMessage text={body} streaming={streaming} />
    </div>
  );
}

function ReasoningTurn({ steps }: { steps: Activity[] }) {
  const text = steps.map((s) => s.summary).join("\n");
  return (
    <div className={styles.turn}>
      <ReasoningBlock text={text} />
    </div>
  );
}

function ToolTurn({
  group,
  getDetail,
  focused,
}: {
  group: Extract<Group, { type: "tool" }>;
  getDetail: (seq: number) => Promise<string>;
  focused?: boolean;
}) {
  const { use, result } = group;
  const tool = use?.tool || result?.tool || "工具";
  const running = !result;
  const [detail, setDetail] = React.useState<string | null>(null);
  const loadedKey = React.useRef<string | null>(null);
  const detailKey = `${use?.seq ?? ""}:${result?.seq ?? ""}`;
  const command =
    use && use.summary.startsWith(tool) ? use.summary.slice(tool.length).trimStart() : (use?.summary ?? "");
  React.useEffect(() => {
    if (result == null || loadedKey.current === detailKey) return;
    let live = true;
    void getDetail(result.seq)
      .then((d) => {
        if (live) {
          setDetail(d || "（空）");
          loadedKey.current = detailKey;
        }
      })
      .catch(() => {
        if (live) setDetail("（加载失败）");
      });
    return () => {
      live = false;
    };
  }, [detailKey, result, getDetail]);
  return (
    <div className={styles.turn}>
      <ToolCallBlock
        tool={tool}
        command={command}
        output={detail}
        running={running}
        isError={!!result?.is_error}
        defaultOpen={focused}
      />
    </div>
  );
}

/** 日期分隔：参考端置于转录顶部（13px/20px，日期部分 500），py-4。 */
function formatDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay(d, now)) return `今天 ${time}`;
  if (sameDay(d, yesterday)) return `昨天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

function DateSeparator({ ts }: { ts: string }) {
  const label = formatDay(ts);
  if (!label) return null;
  const [day, time] = label.split(" ");
  return (
    <div className={styles.dateSeparator}>
      <b>{day}</b>
      {time ? <span>&nbsp;{time}</span> : null}
    </div>
  );
}

/**
 * ChatTranscript 是 Codex 会话态的转录渲染：消息之间 gap-12px，
 * 新到的消息走 --cubic-enter 进入动画，流式末尾跟一个 .7s 的光标。
 */
export function ChatTranscript({
  activity,
  live,
  fetchDetail,
  emptyText,
}: {
  activity: Activity[];
  live?: boolean;
  fetchDetail: (seq: number) => Promise<string>;
  emptyText?: string;
}) {
  const groups = React.useMemo(() => groupChat(activity), [activity]);
  const seen = React.useRef<Set<number>>(new Set());
  const firstPass = React.useRef(true);
  const entering = new Set<number>();
  if (!firstPass.current) {
    for (const g of groups) if (!seen.current.has(g.key)) entering.add(g.key);
  }
  React.useEffect(() => {
    firstPass.current = false;
    for (const g of groups) seen.current.add(g.key);
  });

  if (groups.length === 0) return <ChatEmpty text={emptyText ?? "开始新的对话"} />;

  const lastKey = groups[groups.length - 1]?.key;
  const firstTs =
    activity.find((a) => !!a.ts)?.ts ?? "";
  return (
    <div className={styles.transcriptList}>
      {firstTs ? <DateSeparator ts={firstTs} /> : null}
      {groups.map((g) => {
        const cls = entering.has(g.key) ? `${styles.turn} ${styles.enter}` : styles.turn;
        const streaming = !!live && g.key === lastKey;
        // 时间戳：round 没有时间；reasoning 取首步；tool 取 use/result；其余取该组第一步。
        let metaTs: string | undefined;
        if (g.type === "reasoning") metaTs = g.steps[0]?.ts;
        else if (g.type === "user" || g.type === "answer" || g.type === "intercept") metaTs = g.step.ts;
        else if (g.type === "tool") metaTs = (g.use ?? g.result)?.ts;
        return (
          <div key={g.key} className={cls}>
            {g.type === "round" ? (
              <RoundDivider label={g.label} />
            ) : g.type === "user" ? (
              <UserTurn step={g.step} getDetail={fetchDetail} ts={metaTs} />
            ) : g.type === "answer" ? (
              <AnswerTurn step={g.step} getDetail={fetchDetail} streaming={streaming && g.step.kind !== "result"} />
            ) : g.type === "reasoning" ? (
              <ReasoningTurn steps={g.steps} />
            ) : g.type === "tool" ? (
              <ToolTurn group={g} getDetail={fetchDetail} />
            ) : (
              <div className={styles.toolCall}>
                <div className={styles.toolToggle}>
                  <span className={styles.toolName}>审批请求</span>
                  <span className={styles.toolCmd}>{g.step.summary}</span>
                </div>
              </div>
            )}
            {g.type !== "round" && <MsgMeta ts={metaTs} />}
          </div>
        );
      })}
    </div>
  );
}
