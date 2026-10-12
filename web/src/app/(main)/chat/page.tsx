"use client";

import * as React from "react";

import { createPortal } from "react-dom";

import {
  Bot,
  ChevronRightIcon,
  ListChecksIcon,
  Loader2Icon,
  PaperclipIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  CodexArrowUp,
  CodexChevronDown,
  CodexEllipsis,
  CodexFolder,
  CodexGear,
  CodexHomeHero,
  CodexPlus,
  CodexSidebar,
} from "@/components/icons/codex";
import { MentionTextarea } from "@/components/mention-textarea";
import { SideQuestionButton, SideQuestionWorkspace } from "@/components/side-question-workspace";
import { TodoPopover } from "@/components/todo-popover";
import { ApprovalExecutionFocus, useApprovalFocus, useApprovalHistory } from "@/components/approval-execution-focus";
import { useSidebar } from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  Badge,
  Button,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@/codex-ui/codex/ui";
import { useSideQuestions } from "@/hooks/use-side-questions";
import { mergeActivities } from "@/lib/activity-merge";
import { api } from "@/lib/api";
import { shouldSubmitOnKey, useChatSendMode } from "@/lib/chat-send-mode";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { isBtwCommand } from "@/lib/side-questions";
import type { Activity, Agent, ChatAttachment, Conversation, LLMProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

import styles from "./_components/codex-chat.module.css";
import { PermissionPill } from "./_components/permission-pill";
import { ChatTranscript } from "@/codex-ui/chat";

// fmtBytes renders a human file size for attachment chips (mirrors transcript.tsx).
function fmtBytes(n: number): string {
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`;
  return `${n} B`;
}

// fmtTokens renders a compact token count (1234 → 1.2k, 2_000_000 → 2M).
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

// fmtDuration renders an elapsed milliseconds span compactly (90s → 1m30s).
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

// HISTORY_PAGE is how many steps one history page loads: the latest page on open,
// then one more page each time the user scrolls to the top. Kept modest so a long
// thread stays snappy (only ~a page of rows is in the DOM until you scroll up).
const HISTORY_PAGE = 200;
const CONVERSATION_LIST_PAGE = 100;

// Which agent groups the user has collapsed in the left rail. Persisted so the
// rail looks the same after a reload; unknown keys are harmless (a deleted agent
// simply never renders a group again).
const COLLAPSED_AGENTS_KEY = "artex.chat.collapsed-agents";

function conversationIsPinned(conversation: Conversation): boolean {
  return conversation.pinned ?? Boolean(conversation.pinned_at);
}

// AgentGroup is one collapsible section of the left rail: all unpinned
// conversations of a single agent, newest activity first.
interface AgentGroup {
  key: string;
  name: string;
  conversations: Conversation[];
  runningCount: number;
}

// groupByAgent buckets conversations by agent, preserving the incoming order
// both inside a group and across groups. The server already sorts by updated_at
// DESC, so first-appearance order == most-recently-active group first.
function groupByAgent(conversations: Conversation[], agentByKey: Map<string, Agent>): AgentGroup[] {
  const groups = new Map<string, AgentGroup>();
  for (const conversation of conversations) {
    let group = groups.get(conversation.agent_key);
    if (!group) {
      group = {
        key: conversation.agent_key,
        name: agentByKey.get(conversation.agent_key)?.name || conversation.agent_key,
        conversations: [],
        runningCount: 0,
      };
      groups.set(conversation.agent_key, group);
    }
    group.conversations.push(conversation);
    if (conversation.running) group.runningCount++;
  }
  return [...groups.values()];
}

// LiveBadge is the small pulsing "实时" chip reused from the task's main-agent
// console — shown while a turn is streaming.
function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
      <span className="size-1 animate-pulse rounded-full bg-blue-500" />
      实时
    </span>
  );
}

// Composer 是 Codex 官方 _ComposerLayout_ 的 1:1 复刻（数值见 codex-chat.module.css）：
//   面板 736×98 / 圆角 22px / rgb(54,54,54) / inset 0 0 1px rgba(255,255,255,.2)；
//   竖向 = 附件区 14px（空态也是 8px + 6px 内边距）+ 输入行 44px（+4px 间距）+ 工具行 28px（+8px）。
//   工具行按钮 28 高 / 9999px 药丸 / 13px·430 / rgba(255,255,255,.498)；
//   发送键 28×28 药丸 rgb(223,223,223)，箭头 16px 反色；流式中换成停止键。
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  leftSlot,
  running,
  onStop,
  stopDisabled,
  attachments,
  onPickFiles,
  onRemoveAttachment,
  uploading,
  allowBtw,
  footerSlot,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  leftSlot?: React.ReactNode;
  className?: string;
  running?: boolean;
  onStop?: () => void;
  stopDisabled?: boolean;
  // 方式1 文件上传:传了 onPickFiles 才显示「+」按钮 + 附件 chip 预览。
  attachments?: ChatAttachment[];
  onPickFiles?: (files: File[]) => void;
  onRemoveAttachment?: (path: string) => void;
  uploading?: boolean;
  allowBtw?: boolean;
  footerSlot?: React.ReactNode;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const atts = attachments ?? [];
  // 发送键位由系统设置决定（localStorage），默认 Enter 发送。
  const sendMode = useChatSendMode();
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitOnKey(e, sendMode)) return;
    e.preventDefault();
    onSend();
  }
  return (
    <div className={cn(styles.composer, className)} data-slot="codex-composer">
      {/* 附件区：官方空态也有 padding（8px 8px 6px），所以永远渲染 */}
      <div className={styles.composerAttachments}>
        {atts.map((a) => (
          <div key={a.path} className={styles.attachmentChip} title={a.path}>
            <PaperclipIcon className="size-3 shrink-0" />
            <span className={styles.attachmentChipName}>{a.name}</span>
            <span className={styles.attachmentChipMeta}>{fmtBytes(a.size)}</span>
            {onRemoveAttachment && (
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onRemoveAttachment(a.path)}
                title="移除"
                aria-label={`移除附件 ${a.name}`}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 输入行：官方 padding 0 12px、margin-bottom 4px、编辑区最小高 44px */}
      <div className={styles.composerInputRow} data-slot="codex-composer-input-row">
        <MentionTextarea
          className={styles.composerInput}
          rows={1}
          placeholder={placeholder}
          value={value}
          disabled={disabled && !(running && allowBtw)}
          onValueChange={onChange}
          onKeyDown={onKeyDown}
        />
      </div>

      {/* 工具行：官方 grid minmax(0,auto) auto minmax(0,1fr)、column-gap 5px、
          padding-inline 8px、margin-bottom 8px */}
      <div className={styles.composerFooter} data-slot="codex-composer-footer">
        <div className={styles.composerFooterLead}>
          {leftSlot}
          {onPickFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  // FileList 与 input 元素活绑定:必须先快照成数组,再清空 value,
                  // 否则异步的 onPickFiles(比如草稿态要先建会话)恢复执行时会拿到空列表。
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = ""; // allow re-picking the same file
                  if (picked.length > 0) onPickFiles(picked);
                }}
              />
              <button
                type="button"
                className={styles.composerTool}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
                title="添加文件等内容"
                aria-label="添加文件等内容"
              >
                {uploading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CodexPlus size={16} />
                )}
              </button>
            </>
          )}
      {/* 官方工具行左组的顺序是「+ 然后 权限药丸」；ARTEX 用**真实**的拦截规则姿态填这个位
          （0 条启用 = 橙色「拦截已关闭 · 完全放开」，N 条 = 次要色「拦截 · N 条规则」），
          见 _components/permission-pill.tsx。 */}
      <PermissionPill />
        </div>
        <div />
        <div className={styles.composerFooterEnd}>
          {running && allowBtw && isBtwCommand(value) && (
            <Button
              aria-label="发送旁路问题"
              className={styles.sendButton}
              pill
              size="sm"
              title="发送旁路问题"
              variant="solid"
              onClick={onSend}
            >
              <CodexArrowUp size={16} />
            </Button>
          )}
          {footerSlot}
          {running ? (
            // 流式中：发送键换成停止键（只中断本次运行，触发队列不受影响）
            <Button
              aria-label="停止生成"
              className={styles.stopButton}
              color="danger"
              disabled={stopDisabled}
              pill
              size="sm"
              title="停止本次运行"
              variant="solid"
              onClick={onStop}
            >
              <span className="block size-3 rounded-[3px] bg-current" />
            </Button>
          ) : (
            <Button
              aria-label="发送消息"
              className={styles.sendButton}
              disabled={disabled || (!value.trim() && atts.length === 0)}
              pill
              size="sm"
              title="发送消息"
              variant="solid"
              onClick={onSend}
            >
              <CodexArrowUp size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// LLMProfileRow 是输入区工具行右侧的「模型」药丸（官方那颗 "5.6 Sol Ultra"）：
// 28 高 / 9999px 药丸 / 内边距 0 8px / 13px·430 / 次要色，点开切换 ARTEX 的 LLM 配置。
function LLMProfileRow({
  profiles,
  selected,
  onChange,
  disabled,
  rightSlot,
}: {
  profiles: LLMProfile[];
  selected: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const activeDefault = profiles.find((p) => p.is_default);
  const current = selected != null ? profiles.find((p) => Number(p.id) === selected) : null;
  const label = current ? current.name : activeDefault ? activeDefault.name : "默认模型";

  return (
    <>
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`${styles.composerTool} ${styles.composerToolWide}`}
            title={label}
            aria-label="切换模型"
          >
            <span className={styles.composerToolLabel}>{label}</span>
            <CodexChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <p className="text-muted-foreground px-2 py-1 text-[11px] font-medium">选择 LLM 配置</p>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-accent",
              selected == null && "bg-accent",
            )}
          >
            <span className="text-sm">默认{activeDefault ? `（${activeDefault.name}）` : ""}</span>
            {activeDefault && (
              <span className="text-muted-foreground text-[11px]">
                {activeDefault.format} · {activeDefault.model}
              </span>
            )}
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(Number(p.id));
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-accent",
                selected === Number(p.id) && "bg-accent",
              )}
            >
              <span className="text-sm">{p.name}</span>
              <span className="text-muted-foreground text-[11px]">
                {p.format} · {p.model}
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {rightSlot}
    </>
  );
}

// DraftChat is the default right-pane view: a fresh chat (agent picker in the
// header, centered empty state, composer) with NO conversation created yet. The
// conversation is created lazily on the first send (ChatGPT-style), then the
// parent switches to the real ChatView.
function DraftChat({
  agents,
  profiles,
  onStarted,
}: {
  agents: Agent[];
  profiles: LLMProfile[];
  onStarted: (c: Conversation, pending?: { input?: string; attachments?: ChatAttachment[] }) => void;
}) {
  const { toggleSidebar } = useSidebar();
  const [agentKey, setAgentKey] = React.useState("");
  const [llmProfileId, setLlmProfileId] = React.useState<number | null>(null);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  // default the agent to Auto once agents load.
  React.useEffect(() => {
    if (!agentKey && agents.some((a) => a.key === "auto")) setAgentKey("auto");
  }, [agentKey, agents]);

  const agent = agents.find((a) => a.key === agentKey);

  async function send() {
    const msg = input.trim();
    if (!msg || !agentKey || sending) return;
    setSending(true);
    try {
      const c = await api.createConversation(agentKey, "", llmProfileId);
      await api.sendConversationMessage(c.id, msg);
      onStarted(c);
    } catch (e) {
      toast.error("发送失败：" + (e as Error).message);
      setSending(false);
    }
  }

  // Attachments need a conversation to own the uploads dir (sessions/conv-<id>/),
  // and a draft has none yet — so picking a file CREATES the conversation, uploads
  // into it, then hands off to ChatView carrying the typed text + attachments (the
  // user sends from there). Mirrors the task main-agent console's upload, adapted to
  // the ChatGPT-style lazy-create flow.
  async function pickFiles(files: File[]) {
    if (files.length === 0 || !agentKey || uploading || sending) return;
    setUploading(true);
    try {
      const c = await api.createConversation(agentKey, "", llmProfileId);
      const r = await api.chatUpload("session", `conv-${c.id}`, files);
      onStarted(c, { input, attachments: r.attachments });
    } catch (e) {
      toast.error("上传失败：" + (e as Error).message);
      setUploading(false);
    }
  }

  const agentPicker = (
    <Select value={agentKey} onValueChange={setAgentKey}>
      <SelectTrigger aria-label="选择 Agent" className={styles.projectChip}>
        <CodexFolder size={16} />
        <SelectValue placeholder="选择项目" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {agents.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              <span className="flex items-center gap-2">
                <Bot className="size-3.5" />
                {a.name}
                {!a.builtin && <Badge size="sm">自定义</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  return (
    <>
      {/* 首页也有一条 52px 标题栏（参考端 --app-shell-header-height，主表面 44..96）：
          右端是面板切换键（28×28，右缘 = 主表面右缘 - 12px）。它同时把内容区推到 y=96，
          否则标题块会整体高 52px（实测踩过这个坑）。 */}
      <div className={styles.threadHeader} data-slot="codex-home-header">
        <div className={styles.threadActions}>
          <Button
            className={styles.threadAction}
            size="sm"
            uniform
            title="显示/隐藏面板"
            aria-label="显示/隐藏面板"
            onClick={toggleSidebar}
          >
            <CodexSidebar size={16} />
          </Button>
        </div>
      </div>

      {/* 首页态 = Codex 参考端实测（1280×816）：
          标题块 [424,327,768,114] = hero 56＋间距 24＋标题 34（标题 407..441）；
          标题 heading-xl 28px / 400 / 行高 33.6px；左右 20px 内边距。 */}
      <div className={styles.homeTitleRegion} data-slot="codex-home-title-region">
        <div className={cn(styles.column, "px-5 text-center")} data-slot="codex-home-title-box">
          <div className={styles.homeTitleBox}>
            <CodexHomeHero className={styles.homeHero} size={56} />
            <h1 className={styles.homeTitle}>我们要构建什么？</h1>
          </div>
          {agent?.description && <p className={styles.homeSubtitle}>{agent.description}</p>}
        </div>
      </div>

      {/* 输入区列：实测 [424,644,768,152]、padding 0 16px
          （「选择项目」条 710×42 @660 + 输入面板 736×98 @698，条被面板压住 4px） */}
      <div className={cn(styles.composerColumn, styles.column)} data-slot="codex-composer-column">
        <div className={styles.projectBar} data-slot="codex-project-bar">
          <div className={styles.projectBarInner}>{agentPicker}</div>
        </div>
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          disabled={sending || uploading || !agentKey}
          placeholder="随心输入"
          onPickFiles={pickFiles}
          uploading={uploading}
          className={styles.composerStacked}
          footerSlot={
            <LLMProfileRow
              profiles={profiles}
              selected={llmProfileId}
              onChange={setLlmProfileId}
              disabled={sending || uploading}
            />
          }
        />
      </div>
    </>
  );
}

// ChatView is the right pane for one conversation — mirrors the task detail's
// main-agent console: header with agent + live badge + token/duration meta, a
// scroll-stick transcript (chat mode), and the composer.
function ChatView({
  conv,
  agents,
  profiles,
  initial,
  onTitleMaybeChanged,
  onConvUpdated,
}: {
  conv: Conversation;
  agents: Agent[];
  profiles: LLMProfile[];
  // pending text + already-uploaded attachments handed off from a draft that
  // created this conversation via the paperclip (consumed once, on mount).
  initial?: { input?: string; attachments?: ChatAttachment[] };
  onTitleMaybeChanged: () => void;
  onConvUpdated: () => void;
}) {
  const { toggleSidebar } = useSidebar();
  const approvalFocus = useApprovalFocus({ conversationId: conv.id });
  const [messages, setMessages] = React.useState<Activity[]>([]);
  const [running, setRunning] = React.useState(false);
  const [input, setInput] = React.useState(initial?.input ?? "");
  const [sending, setSending] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  // 方式1 文件上传:已上传的附件(落到 sessions/conv-<id>/uploads/),随下条消息一起发。
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>(initial?.attachments ?? []);
  const [uploading, setUploading] = React.useState(false);
  const cursorRef = React.useRef(0); // newest loaded id — incremental-tail anchor
  const earliestRef = React.useRef(0); // earliest loaded id — reverse-pagination anchor
  const hasMoreRef = React.useRef(false); // older history remains above the loaded window
  const loadingMoreRef = React.useRef(false); // guard: one scroll-up load at a time
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false); // drives the "load earlier" hint
  const agent = agents.find((a) => a.key === conv.agent_key);
  const currentProfileId = conv.llm_profile_id ?? null;
  const side = useSideQuestions(`/api/conversations/${conv.id}`);

  async function changeProfile(id: number | null) {
    try {
      await api.updateConversationProfile(conv.id, id);
      onConvUpdated();
    } catch (e) {
      toast.error("切换 LLM 失败：" + (e as Error).message);
    }
  }

  // conversation-scoped detail fetcher for the reused Transcript renderer.
  const fetchDetail = React.useCallback((seq: number) => api.conversationMsgDetail(conv.id, seq), [conv.id]);

  // seq of the most-recent TodoWrite tool call (for the Todo popover); null if none.
  const latestTodoSeq = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const a = messages[i];
      if (a.kind === "tool_use" && a.tool === "TodoWrite") return a.seq;
    }
    return null;
  }, [messages]);

  // reset + load whenever the selected conversation changes. Load only the LATEST
  // page on open — a long thread's final answer sits at the very end, so the newest
  // page shows it immediately (issue #3: opening/refresh used to load the oldest
  // page, so the completed result was missing until another message advanced the
  // cursor). Older history streams in on scroll-up (loadEarlier below).
  React.useEffect(() => {
    cursorRef.current = 0;
    earliestRef.current = 0;
    hasMoreRef.current = false;
    setHasMore(false);
    setMessages([]);
    setHistoryLoaded(false);
    setRunning(false);
    let live = true;
    api
      .conversationHistory(conv.id, 0, HISTORY_PAGE)
      .then((r) => {
        if (!live) return;
        setMessages((current) => mergeActivities(r.items, current));
        cursorRef.current = Math.max(cursorRef.current, r.cursor);
        earliestRef.current = r.items.length ? r.items[0].seq : 0;
        hasMoreRef.current = r.hasMore;
        setHasMore(r.hasMore);
        setRunning((current) => current || r.running);
        setHistoryLoaded(true);
      })
      .catch(() => {
        // A source link can retry history through its locator; ordinary chats
        // retain the existing usable empty state on a transient failure.
        if (live) setHistoryLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [conv.id]);

  // A trigger or another tab may start a turn while this conversation is open.
  // A false list snapshot must not stop the tail before its final messages load.
  React.useEffect(() => {
    if (conv.running) setRunning(true);
  }, [conv.running]);

  // poll while a turn is running: pull new steps after the cursor.
  React.useEffect(() => {
    if (!running) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let keepPolling = true;
      try {
        const r = await api.conversationMessages(conv.id, cursorRef.current);
        if (!live) return;
        if (r.items.length) {
          setMessages((prev) => mergeActivities(prev, r.items));
        }
        cursorRef.current = Math.max(cursorRef.current, r.cursor);
        keepPolling = r.running;
        setRunning(r.running);
        if (!r.running) onTitleMaybeChanged(); // first-turn auto-title landed
      } catch {
        /* transient — keep polling */
      } finally {
        // Slow responses must not overlap another poll with the same cursor.
        if (live && keepPolling) timer = setTimeout(() => void tick(), 1000);
      }
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [running, conv.id, onTitleMaybeChanged]);

  const loadFocusPage = React.useCallback((before: number) => api.conversationHistory(conv.id, before, HISTORY_PAGE), [conv.id]);
  const mergeFocusPage = React.useCallback((page: { items: Activity[]; hasMore: boolean }) => {
    setMessages((prev) => mergeActivities(page.items, prev));
    earliestRef.current = page.items[0]?.seq ?? earliestRef.current;
    hasMoreRef.current = page.hasMore;
    setHasMore(page.hasMore);
  }, []);
  const focusHistory = useApprovalHistory(approvalFocus.state?.source, historyLoaded, messages, loadFocusPage, mergeFocusPage);

  // ---- transcript auto-scroll (open → bottom; stick to bottom unless scrolled up) ----
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const atBottomRef = React.useRef(true);
  const viewport = React.useCallback(
    () => (contentRef.current?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null) ?? null,
    [],
  );
  // Scroll-up loads one older page and prepends it, preserving the visual position
  // so the view doesn't jump (record height/offset before, restore the delta after).
  const loadEarlier = React.useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const vp = viewport();
    if (!vp) return;
    loadingMoreRef.current = true;
    const prevH = vp.scrollHeight;
    const prevTop = vp.scrollTop;
    try {
      const r = await api.conversationHistory(conv.id, earliestRef.current, HISTORY_PAGE);
      if (r.items.length) {
        setMessages((prev) => mergeActivities(r.items, prev));
        earliestRef.current = r.items[0].seq;
      }
      hasMoreRef.current = r.hasMore;
      setHasMore(r.hasMore);
      requestAnimationFrame(() => {
        const v = viewport();
        if (v) v.scrollTop = prevTop + (v.scrollHeight - prevH);
      });
    } catch {
      /* transient — a later scroll retries */
    } finally {
      loadingMoreRef.current = false;
    }
  }, [conv.id, viewport]);
  React.useEffect(() => {
    const vp = viewport();
    if (!vp) return;
    const onScroll = () => {
      if (approvalFocus.state && !focusHistory.ready) return;
      atBottomRef.current = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 60;
      if (vp.scrollTop <= 80) void loadEarlier(); // near top → pull an older page
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [viewport, loadEarlier, approvalFocus.state, focusHistory.ready]);
  // open/switch a conversation → jump to the latest (bottom)
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing conversations intentionally retriggers the scroll reset.
  React.useLayoutEffect(() => {
    const vp = viewport();
    if (vp) {
      vp.scrollTop = vp.scrollHeight;
      atBottomRef.current = true;
    }
  }, [conv.id, viewport]);
  // new activity → stick to bottom only if the user is already pinned there
  // biome-ignore lint/correctness/useExhaustiveDependencies: message and running changes intentionally retrigger bottom anchoring.
  React.useLayoutEffect(() => {
    if (approvalFocus.state || !atBottomRef.current) return;
    const vp = viewport();
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [messages, running, viewport, approvalFocus.state]);

  // Per-conversation token total, live — same accounting as the main-agent
  // console: completed runs' `result` sum + the in-progress run's latest `usage`.
  const tokenTotal = React.useMemo(() => {
    let i = 0,
      o = 0,
      cr = 0;
    let li = 0,
      lo = 0,
      lcr = 0;
    let turns = 0; // agent 循环轮次 = 模型调用次数（每次一条 kind='usage'）
    for (const a of messages) {
      if (a.kind === "result") {
        i += a.input_tokens ?? 0;
        o += a.output_tokens ?? 0;
        cr += a.cache_read_tokens ?? 0;
        li = lo = lcr = 0;
      } else if (a.kind === "usage") {
        turns += 1;
        li = a.input_tokens ?? 0;
        lo = a.output_tokens ?? 0;
        lcr = a.cache_read_tokens ?? 0;
      }
    }
    const I = i + li,
      O = o + lo,
      CR = cr + lcr;
    return { i: I, o: O, cr: CR, turns, any: I + O + CR > 0 };
  }, [messages]);

  // pickFiles uploads into this conversation's session dir (sessions/conv-<id>/
  // uploads/) and queues the returned metadata to send with the next message.
  async function pickFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const r = await api.chatUpload("session", `conv-${conv.id}`, files);
      setAttachments((prev) => [...prev, ...r.attachments]);
    } catch (e) {
      toast.error("上传失败：" + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const msg = input.trim();
    const atts = attachments;
    if (side.handleCommand(msg, () => setInput(""))) return;
    if ((!msg && atts.length === 0) || sending || running) return;
    setSending(true);
    setInput("");
    setAttachments([]);
    try {
      await api.sendConversationMessage(conv.id, msg, atts.length ? atts : undefined);
      // The live loop pulls the persisted human turn immediately. Sharing that
      // fetch avoids racing a separate post-send request against the poller.
      setRunning(true);
    } catch (e) {
      toast.error("发送失败：" + (e as Error).message);
      setInput(msg); // restore so the user doesn't lose their text
      setAttachments(atts); // and their attachments
    } finally {
      setSending(false);
    }
  }

  // stop aborts the in-flight run for this conversation. running flips to false on
  // the next 1s poll once the backend unwinds the agent; the trigger queue is not
  // affected — the agent's next queued fire still starts.
  async function stop() {
    if (stopping) return;
    setStopping(true);
    try {
      await api.stopConversation(conv.id);
    } catch (e) {
      toast.error("停止失败：" + (e as Error).message);
    } finally {
      setStopping(false);
    }
  }

  return (
    <SideQuestionWorkspace side={side} label={agent?.name ?? conv.agent_key} composerLayout="inline">
      {/* 会话标题栏：参考端 main 顶部 52px（--app-shell-header-height），
          左侧会话标题 14px·430，右侧图标组（更多 / 设置 / 面板）。 */}
      <div className={styles.threadHeader} data-slot="codex-thread-header">
        <span className={styles.threadTitle} title={conv.title || agent?.name || conv.agent_key}>
          {conv.title || agent?.name || conv.agent_key}
        </span>
        {running && <LiveBadge />}
        <SideQuestionButton side={side} />
        <div className={styles.threadActions}>
          <Popover>
            <PopoverTrigger asChild>
              <Button className={styles.threadAction} size="md" uniform title="会话信息" aria-label="会话信息">
                <CodexEllipsis size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-3 text-xs">
              <p className="text-muted-foreground mb-1 font-medium">本会话用量</p>
              <p className="tabular-nums">
                {tokenTotal.turns > 0 ? `${tokenTotal.turns} 轮 · ` : ""}
                {tokenTotal.any
                  ? `input ${fmtTokens(tokenTotal.i)} · cache ${fmtTokens(tokenTotal.cr)} · output ${fmtTokens(tokenTotal.o)}`
                  : "暂无用量"}
              </p>
            </PopoverContent>
          </Popover>
          <Button asChild className={styles.threadAction} size="md" uniform title="设置" aria-label="设置">
            <a href="/system/settings/">
              <CodexGear size={16} />
            </a>
          </Button>
          <Button
            className={styles.threadAction}
            size="sm"
            uniform
            title="显示/隐藏面板"
            aria-label="显示/隐藏面板"
            onClick={toggleSidebar}
          >
            <CodexSidebar size={16} />
          </Button>
        </div>
      </div>

      <ApprovalExecutionFocus focus={approvalFocus} history={focusHistory} />

      {/* 消息滚动区：转录列 768px 居中、padding 0 16px 32px */}
      <ScrollArea type="auto" className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div
          className={cn(styles.column, styles.transcriptColumn, styles.transcriptViewport)}
          data-slot="codex-transcript-column"
          ref={contentRef}
        >
          {messages.length === 0 && !running ? (
            <ChatTranscript
              activity={[]}
              fetchDetail={fetchDetail}
              emptyText={`开始和「${agent?.name ?? conv.agent_key}」对话`}
            />
          ) : (
            <>
              {hasMore && <div className={styles.emptyState}>向上滚动加载更早的消息…</div>}
              <ChatTranscript activity={messages} live={running} fetchDetail={fetchDetail} />
            </>
          )}
          {/* 底部渐隐：参考端 915×32 sticky 贴底 */}
          <div className={styles.transcriptFade} aria-hidden="true" />
        </div>
      </ScrollArea>

      {/* 输入区列：768px、padding 0 16px 16px（sticky 贴底） */}
      <div
        className={cn(styles.composerColumn, styles.composerColumnConversation, styles.column)}
        data-slot="codex-composer-column"
      >
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          disabled={running || sending}
          allowBtw
          placeholder={running ? "Agent 正在回复，可输入 /btw 提问…" : "随心输入"}
          running={running}
          onStop={stop}
          stopDisabled={stopping}
          attachments={attachments}
          onPickFiles={pickFiles}
          onRemoveAttachment={(path) => setAttachments((p) => p.filter((x) => x.path !== path))}
          uploading={uploading}
          footerSlot={
            <LLMProfileRow
              profiles={profiles}
              selected={currentProfileId}
              onChange={changeProfile}
              disabled={running}
              rightSlot={<TodoPopover seq={latestTodoSeq} fetchDetail={fetchDetail} />}
            />
          }
        />
      </div>
    </SideQuestionWorkspace>
  );
}

// ConversationItem is one row in the left rail: title, agent subtitle, inline
// rename, pin marker, and a compact action menu. Rows nested under an agent
// group drop the agent subtitle (showAgent=false) — the header already says it.
const ConversationItem = React.memo(function ConversationItem({
  conv,
  agent,
  showAgent = true,
  active,
  renaming,
  renameText,
  onSelect,
  onStartRename,
  onRenameText,
  onCommitRename,
  onCancelRename,
  onTogglePinned,
  onDelete,
  selectionMode,
  selectedForDelete,
  onSelectedForDeleteChange,
}: {
  conv: Conversation;
  agent?: Agent;
  showAgent?: boolean;
  active: boolean;
  renaming: boolean;
  renameText: string;
  onSelect: (id: number) => void;
  onStartRename: (conversation: Conversation) => void;
  onRenameText: (v: string) => void;
  onCommitRename: (id: number, title: string) => void;
  onCancelRename: () => void;
  onTogglePinned: (conversation: Conversation) => void;
  onDelete: (id: number) => void;
  selectionMode: boolean;
  selectedForDelete: boolean;
  onSelectedForDeleteChange: (id: number, checked: boolean) => void;
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const renameInputRef = React.useRef<HTMLInputElement>(null);
  const cancelRenameRef = React.useRef(false);
  const pinned = conversationIsPinned(conv);

  React.useEffect(() => {
    if (!renaming) return;
    cancelRenameRef.current = false;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  return (
    <div
      data-codex-history-item
      data-active={active ? "true" : undefined}
      className={cn(
        "codex-history-item group flex min-w-0 items-center gap-1 rounded-md pr-0.5 transition-colors",
        active ? "bg-[rgb(255_255_255_/_0.08)] text-foreground" : "hover:bg-[rgb(255_255_255_/_0.05)]",
      )}
    >
      {selectionMode && (
        <Checkbox
          checked={selectedForDelete}
          onCheckedChange={(checked) => onSelectedForDeleteChange(conv.id, checked === true)}
          aria-label={`选择对话「${conv.title || "新对话"}」`}
          className="ml-1 shrink-0"
        />
      )}
      {renaming ? (
        <input
          ref={renameInputRef}
          value={renameText}
          onChange={(e) => onRenameText(e.target.value)}
          onBlur={() => {
            if (!cancelRenameRef.current) onCommitRename(conv.id, renameText);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(conv.id, renameText);
            if (e.key === "Escape") {
              e.preventDefault();
              cancelRenameRef.current = true;
              onCancelRename();
            }
          }}
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(conv.id)}
          onDoubleClick={() => onStartRename(conv)}
          title="双击重命名"
          className="codex-history-item-button min-w-0 flex-1 rounded-md px-2 py-1.5 text-left"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {pinned && <PinIcon className="text-primary size-3 shrink-0" aria-label="已置顶" />}
            <div className="codex-history-item-title truncate text-sm">{conv.title || "新对话"}</div>
            {conv.running ? (
              <Badge title="Agent 正在运行">
                <Spinner aria-hidden="true" size="sm" />
                运行中
              </Badge>
            ) : null}
          </div>
          <div className="codex-history-item-meta text-muted-foreground flex min-w-0 items-center gap-1 text-[11px]">
            {showAgent && (
              <>
                <Bot className="size-3 shrink-0" />
                <span className="min-w-0 truncate">{agent?.name ?? conv.agent_key}</span>
                <span className="shrink-0">·</span>
              </>
            )}
            <span className="shrink-0">
              {new Date(conv.created_at).toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="shrink-0 opacity-60">#{conv.id}</span>
          </div>
        </button>
      )}
      {/* 参考端行尾是 2 个 20×20 图标按钮（置顶 / 删除）；悬停或当前选中时出现。 */}
      <div className="codex-history-actions flex shrink-0 items-center justify-center">
        <Button
          className="codex-history-action text-muted-foreground"
          size="sm"
          uniform
          aria-label={pinned ? `取消置顶「${conv.title || "新对话"}」` : `置顶「${conv.title || "新对话"}」`}
          onClick={() => onTogglePinned(conv)}
        >
          {pinned ? <PinOffIcon /> : <PinIcon />}
        </Button>
        <Button
          className="codex-history-action text-muted-foreground hover:text-destructive"
          size="sm"
          uniform
          aria-label={`删除对话「${conv.title || "新对话"}」`}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon />
        </Button>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent
          title={`删除对话「${conv.title || "新对话"}」？`}
          description="此操作不可撤销。"
          footer={
            <>
              <AlertDialogCancel asChild>
                <Button size="sm" variant="ghost">
                  取消
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button color="danger" size="sm" variant="solid" onClick={() => onDelete(conv.id)}>
                  删除
                </Button>
              </AlertDialogAction>
            </>
          }
        />
      </AlertDialog>
    </div>
  );
});

// AgentGroupHeader is the sticky, clickable divider above one agent's rows:
// collapse chevron, agent name, a running marker, and the row count.
function AgentGroupHeader({
  group,
  collapsed,
  hasActive,
  onToggle,
}: {
  group: AgentGroup;
  collapsed: boolean;
  hasActive: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(group.key)}
      aria-expanded={!collapsed}
      title={collapsed ? `展开「${group.name}」` : `收起「${group.name}」`}
      className={cn(
        "codex-history-agent-header sticky top-0 z-10 flex min-w-0 items-center gap-1.5 rounded-md bg-[rgb(30_30_30)] px-1.5 py-1 text-left font-medium text-[11px] transition-colors hover:bg-[rgb(38_38_38)]",
        collapsed && hasActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", !collapsed && "rotate-90")} />
      <Bot className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{group.name}</span>
      {collapsed && hasActive && (
        <span className="size-1.5 shrink-0 rounded-full bg-primary" title="当前对话在此分组内" />
      )}
      {group.runningCount > 0 && (
        <Spinner className="size-3 shrink-0" aria-label={`${group.runningCount} 个对话运行中`} />
      )}
      <span className="shrink-0 tabular-nums opacity-60">{group.conversations.length}</span>
    </button>
  );
}

export default function ChatPage() {
  // Codex 式外壳：对话列表渲染进 288px 面板的插槽（portal），页面里不再有第二列。
  const [listSlot, setListSlot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    const find = () => setListSlot(document.getElementById("chat-conversations-slot"));
    find();
    const timer = window.setInterval(find, 400);
    document.documentElement.dataset.chatList = "on";
    return () => {
      window.clearInterval(timer);
      delete document.documentElement.dataset.chatList;
    };
  }, []);

  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [convs, setConvs] = React.useState<Conversation[]>([]);
  const [agentFilter, setAgentFilter] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [sourceRequested, setSourceRequested] = React.useState(false);
  const [convsLoaded, setConvsLoaded] = React.useState(false);
  const selectConversation = React.useCallback((id: number | null) => {
    if (id !== selectedId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("approval");
      setSourceRequested(false);
      window.history.replaceState(null, "", url);
    }
    setSelectedId(id);
  }, [selectedId]);

  const [renamingId, setRenamingId] = React.useState<number | null>(null);
  const [renameText, setRenameText] = React.useState("");
  const [selectedConversationIds, setSelectedConversationIds] = React.useState<Set<number>>(() => new Set());
  // selectionMode gates the multi-select UI: off by default (clean list, no
  // checkboxes); the header "多选" button turns it on, "完成" turns it off and
  // clears the selection.
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [visibleConversationCount, setVisibleConversationCount] = React.useState(CONVERSATION_LIST_PAGE);
  // Collapsed agent groups. Hydrated from localStorage after mount (not a lazy
  // useState init) so the server and client render the same first pass.
  const [collapsedAgents, setCollapsedAgents] = React.useState<Set<string>>(() => new Set());
  // Pending text + uploaded attachments handed off from a draft that created a
  // conversation via the paperclip, keyed by the new conversation id (consumed once
  // by ChatView on mount; ids never repeat, so leftover entries are harmless).
  const [pendingByConv, setPendingByConv] = React.useState<
    Record<number, { input?: string; attachments?: ChatAttachment[] }>
  >({});

  const conversationListSeq = React.useRef(0);
  const reloadConvs = React.useCallback(async () => {
    const seq = ++conversationListSeq.current;
    try {
      const items = await api.conversations();
      if (seq === conversationListSeq.current) { setConvs(items); setConvsLoaded(true); }
    } catch {
      // Preserve the selected transcript and list on a transient poll failure.
    }
  }, []);
  React.useEffect(() => {
    api
      .agents()
      .then(setAgents)
      .catch(() => {
        /* Agent metadata is optional for rendering an existing conversation. */
      });
    api
      .llmProfiles()
      .then(setProfiles)
      .catch(() => {
        /* The conversation remains usable without profile labels. */
      });
  }, []);

  // One list poll supplies runtime state for all sidebar rows, including the
  // unselected ones. Await completion so slow requests do not overlap.
  React.useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await reloadConvs();
      if (!disposed) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => {
      disposed = true;
      conversationListSeq.current++;
      clearTimeout(timer);
    };
  }, [reloadConvs]);

  React.useEffect(() => {
    setSelectedConversationIds((current) => {
      if (current.size === 0) return current;
      const live = new Set(convs.map((conversation) => conversation.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [convs]);

  React.useEffect(() => {
    const raw = getLocalStorageValue(COLLAPSED_AGENTS_KEY);
    if (!raw) return;
    try {
      const keys = JSON.parse(raw);
      if (Array.isArray(keys))
        setCollapsedAgents(new Set(keys.filter((key): key is string => typeof key === "string")));
    } catch {
      // Corrupted entry → start with everything expanded.
    }
  }, []);

  const toggleAgentCollapsed = React.useCallback((key: string) => {
    setCollapsedAgents((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      setLocalStorageValue(COLLAPSED_AGENTS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Restore the open conversation from the URL (?c=<id>) on mount, so a refresh
  // returns to the same thread instead of the empty draft view. Runs after
  // hydration (not a lazy useState init) to avoid a server/client mismatch.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSourceRequested(params.has("approval"));
    const c = params.get("c");
    const id = c ? Number(c) : NaN;
    if (Number.isFinite(id)) setSelectedId(id);
  }, []);
  // Mirror the current selection into the URL (replaceState → no history spam). A
  // selectedId with no matching conversation (e.g. a stale ?c=, or a just-created
  // one before reloadConvs lands) simply renders the draft view — harmless — so we
  // deliberately do NOT auto-clear it here (that raced new-conversation creation).
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId != null) url.searchParams.set("c", String(selectedId));
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  const selected = React.useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);
  const agentByKey = React.useMemo(() => new Map(agents.map((agent) => [agent.key, agent])), [agents]);
  const filteredConversations = React.useMemo(
    () => (agentFilter === null ? convs : convs.filter((conversation) => conversation.agent_key === agentFilter)),
    [convs, agentFilter],
  );
  const visibleConversations = React.useMemo(
    () => filteredConversations.slice(0, visibleConversationCount),
    [filteredConversations, visibleConversationCount],
  );
  // Pinned rows stay a flat block above the groups (server order = pinned_at DESC);
  // everything else is bucketed per agent, most-recently-active agent first.
  const pinnedConversations = React.useMemo(
    () => visibleConversations.filter(conversationIsPinned),
    [visibleConversations],
  );
  const agentGroups = React.useMemo(
    () =>
      groupByAgent(
        visibleConversations.filter((c) => !conversationIsPinned(c)),
        agentByKey,
      ),
    [visibleConversations, agentByKey],
  );
  // conversation agents: custom agents + conversational built-ins (role=assistant,
  // e.g. Auto / 渗透测试). The orchestration built-ins (goals/planner/mainagent/worker)
  // are task-specific and stay hidden from the chat page.
  const chatAgents = React.useMemo(() => agents.filter((a) => !a.builtin || a.role === "assistant"), [agents]);
  const agentFilterOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const conversation of convs) {
      counts.set(conversation.agent_key, (counts.get(conversation.agent_key) ?? 0) + 1);
    }
    // Include historical sources even if their Agent has since been disabled or deleted.
    const keys = new Set([...chatAgents.map((agent) => agent.key), ...counts.keys()]);
    if (agentFilter !== null) keys.add(agentFilter);
    return [...keys]
      .map((key) => ({ key, name: agentByKey.get(key)?.name || key, count: counts.get(key) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [convs, chatAgents, agentByKey, agentFilter]);
  const conversationCountLabel =
    agentFilter === null ? `共 ${convs.length} 个` : `${filteredConversations.length} / ${convs.length} 个`;

  function changeAgentFilter(key: string | null) {
    setAgentFilter(key);
    setVisibleConversationCount(CONVERSATION_LIST_PAGE);
    setSelectedConversationIds(new Set());
    setBulkDeleteOpen(false);
    setRenamingId(null);
  }

  const selectedConversationCount = selectedConversationIds.size;
  const allConversationsSelected =
    filteredConversations.length > 0 && selectedConversationCount === filteredConversations.length;
  const someConversationsSelected = selectedConversationCount > 0 && !allConversationsSelected;
  let conversationHeaderChecked: boolean | "indeterminate" = false;
  if (allConversationsSelected) conversationHeaderChecked = true;
  else if (someConversationsSelected) conversationHeaderChecked = "indeterminate";

  const toggleConversationSelected = React.useCallback((id: number, checked: boolean) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  function toggleAllConversations(checked: boolean) {
    setSelectedConversationIds(
      checked ? new Set(filteredConversations.map((conversation) => conversation.id)) : new Set(),
    );
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedConversationIds(new Set());
  }

  const del = React.useCallback(
    async (id: number) => {
      try {
        await api.deleteConversation(id);
        setSelectedId((current) => (current === id ? null : current));
        setSelectedConversationIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        void reloadConvs();
      } catch (e) {
        toast.error("删除失败：" + (e as Error).message);
      }
    },
    [reloadConvs],
  );

  async function deleteSelectedConversations() {
    const ids = [...selectedConversationIds];
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    const deleted = new Set<number>();
    const failed: { id: number; error: string }[] = [];
    try {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await api.deleteConversations(ids.slice(offset, offset + 100));
        for (const item of result.items) {
          if (item.ok) deleted.add(item.id);
          else failed.push({ id: item.id, error: item.error ?? "对话不存在" });
        }
      }
      if (deleted.has(selectedId ?? -1)) selectConversation(null);
      setSelectedConversationIds((current) => {
        const next = new Set(current);
        for (const id of deleted) next.delete(id);
        return next;
      });
      if (deleted.size > 0) toast.success(`已删除 ${deleted.size} 个对话`);
      if (failed.length > 0) {
        const details = failed
          .slice(0, 3)
          .map((item) => `#${item.id}（${item.error}）`)
          .join("；");
        toast.error(`${failed.length} 个对话删除失败：${details}${failed.length > 3 ? " 等" : ""}`);
      }
      setBulkDeleteOpen(false);
      // Fully successful → return to the clean list; keep selection mode on if
      // some failed so the user can retry the remaining ones.
      if (failed.length === 0) setSelectionMode(false);
      void reloadConvs();
    } catch (error) {
      toast.error(`批量删除失败：${(error as Error).message}`);
      void reloadConvs();
    } finally {
      setBulkDeleting(false);
    }
  }

  const togglePinned = React.useCallback(
    async (conversation: Conversation) => {
      const pinned = conversationIsPinned(conversation);
      try {
        await api.pinConversation(conversation.id, !pinned);
        void reloadConvs();
      } catch (e) {
        toast.error(`${pinned ? "取消置顶" : "置顶"}失败：${(e as Error).message}`);
      }
    },
    [reloadConvs],
  );

  const startRename = React.useCallback((c: Conversation) => {
    setRenamingId(c.id);
    setRenameText(c.title || "");
  }, []);
  const commitRename = React.useCallback(
    async (id: number, value: string) => {
      const title = value.trim();
      setRenamingId(null);
      if (!title) return;
      try {
        await api.renameConversation(id, title);
        void reloadConvs();
      } catch (e) {
        toast.error("重命名失败：" + (e as Error).message);
      }
    },
    [reloadConvs],
  );
  const cancelRename = React.useCallback(() => setRenamingId(null), []);

  return (
    <div
      data-content-padding="false"
      // Codex 实测（1280×816）：首页态与会话态的对话列**都在 x=424**（= 面板右缘 340 + 84），
      // 即两种状态下内容都让开 288px 面板；转录列 768 宽 / padding 0 16px 32px，
      // 输入区同列 / padding 0 16px 16px。让开面板这件事统一由 MainContent 负责。
      className="flex h-full min-w-0 flex-col overflow-hidden"
    >
      {/* Codex 式：列表已移到外壳面板，页面里只剩对话区单列 */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]">
        {/* left: conversation list */}
        {listSlot
          ? createPortal(
              <div className="codex-history-root flex min-h-0 flex-col overflow-hidden">
          <div className="codex-history-toolbar flex flex-col gap-2 border-b p-2">
            {/* Codex 实测：新聊天是「图标 + 文字」的行 —— 272×30、圆角 12.5px、
                底色 rgba(255,255,255,.08)、文字 13px/430 且为**白 85%**（不是次要色 49.8%） */}
            <Button
              size="sm"
              variant="ghost"
              className="codex-history-new-chat w-full justify-start font-normal text-[color:var(--codex-text-strong)] hover:text-foreground"
              onClick={() => selectConversation(null)}
            >
              <CodexPlus size={14} /> 新聊天
            </Button>
            <Select
              value={agentFilter === null ? "all" : `agent:${agentFilter}`}
              onValueChange={(value) => changeAgentFilter(value === "all" ? null : value.slice(6))}
              disabled={bulkDeleting}
            >
              <SelectTrigger className="codex-history-agent-filter w-full min-w-0" aria-label="按 Agent 筛选对话">
                <Bot />
                <SelectValue placeholder="全部 Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部 Agent</SelectItem>
                  {agentFilterOptions.map((agent) => (
                    <SelectItem key={agent.key} value={`agent:${agent.key}`}>
                      {agent.name}（{agent.count}）
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {convs.length > 0 &&
              (selectionMode ? (
                <div className="codex-history-secondary-controls flex items-center gap-2 px-1">
                  <Checkbox
                    checked={conversationHeaderChecked}
                    onCheckedChange={(checked) => toggleAllConversations(checked === true)}
                    aria-label="选择当前筛选的全部对话"
                    disabled={filteredConversations.length === 0 || bulkDeleting}
                  />
                  <span className="text-muted-foreground min-w-0 flex-1 text-xs tabular-nums">
                    {selectedConversationCount > 0 ? `已选 ${selectedConversationCount} 个` : conversationCountLabel}
                  </span>
                  {selectedConversationCount > 0 && (
                    <Button
                      color="danger"
                      disabled={bulkDeleting}
                      size="sm"
                      variant="soft"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2Icon />
                      删除
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                    完成
                  </Button>
                </div>
              ) : (
                <div className="codex-history-secondary-controls flex items-center gap-2 px-1">
                  <span className="text-muted-foreground min-w-0 flex-1 text-xs tabular-nums">
                    {conversationCountLabel}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setSelectionMode(true)}
                    disabled={filteredConversations.length === 0}
                  >
                    <ListChecksIcon />
                    多选
                  </Button>
                </div>
              ))}
          </div>
          <ScrollArea
            key={agentFilter === null ? "all" : `agent:${agentFilter}`}
            type="auto"
              className="codex-history-scroll min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!"
          >
            <div className="codex-history-list flex min-w-0 flex-col gap-0.5 p-2">
              <div className="codex-history-section-label">项目</div>
              <div className="codex-history-no-project">没有项目</div>
              <div className="codex-history-section-label codex-history-recent-label">
                <span>最近</span>
                <CodexChevronDown size={16} />
              </div>
              {filteredConversations.length === 0 && (
                <p className="text-muted-foreground px-2 py-6 text-center text-xs">
                  {agentFilter === null ? "暂无对话" : "该 Agent 暂无对话"}
                </p>
              )}
              {pinnedConversations.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  agent={agentByKey.get(c.agent_key)}
                  active={selectedId === c.id}
                  renaming={renamingId === c.id}
                  renameText={renamingId === c.id ? renameText : ""}
                  onSelect={selectConversation}
                  onStartRename={startRename}
                  onRenameText={setRenameText}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onTogglePinned={togglePinned}
                  onDelete={del}
                  selectionMode={selectionMode}
                  selectedForDelete={selectedConversationIds.has(c.id)}
                  onSelectedForDeleteChange={toggleConversationSelected}
                />
              ))}
              {agentGroups.map((group) => {
                const collapsed = collapsedAgents.has(group.key);
                return (
                  <React.Fragment key={group.key}>
                    <AgentGroupHeader
                      group={group}
                      collapsed={collapsed}
                      hasActive={group.conversations.some((c) => c.id === selectedId)}
                      onToggle={toggleAgentCollapsed}
                    />
                    {!collapsed &&
                      group.conversations.map((c) => (
                        <ConversationItem
                          key={c.id}
                          conv={c}
                          agent={agentByKey.get(c.agent_key)}
                          showAgent={false}
                          active={selectedId === c.id}
                          renaming={renamingId === c.id}
                          renameText={renamingId === c.id ? renameText : ""}
                          onSelect={selectConversation}
                          onStartRename={startRename}
                          onRenameText={setRenameText}
                          onCommitRename={commitRename}
                          onCancelRename={cancelRename}
                          onTogglePinned={togglePinned}
                          onDelete={del}
                          selectionMode={selectionMode}
                          selectedForDelete={selectedConversationIds.has(c.id)}
                          onSelectedForDeleteChange={toggleConversationSelected}
                        />
                      ))}
                  </React.Fragment>
                );
              })}
              {visibleConversationCount < filteredConversations.length && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => setVisibleConversationCount((count) => count + CONVERSATION_LIST_PAGE)}
                >
                  加载更多
                </Button>
              )}
            </div>
          </ScrollArea>
              </div>,
              listSlot,
            )
          : null}

        {/* right: chat view（styles.scope 提供对话面的官方局部变量） */}
        <div className={cn(styles.scope, "flex min-w-0 flex-col overflow-hidden")}>
          {selected ? (
            <ChatView
              key={selected.id}
              conv={selected}
              agents={agents}
              profiles={profiles}
              initial={pendingByConv[selected.id]}
              onTitleMaybeChanged={reloadConvs}
              onConvUpdated={reloadConvs}
            />
          ) : sourceRequested ? (
            <div role="status" className="p-6 text-sm text-muted-foreground">
              {convsLoaded ? "对话已被删除" : "正在加载对应对话…"}
            </div>
          ) : (
            <DraftChat
              agents={chatAgents}
              profiles={profiles}
              onStarted={(c, pending) => {
                if (agentFilter !== null && agentFilter !== c.agent_key) changeAgentFilter(null);
                // Insert the new conversation immediately so `selected` resolves to
                // it on this render (switching to ChatView right away, before the
                // async reloadConvs lands); reloadConvs then reconciles titles etc.
                if (pending) setPendingByConv((p) => ({ ...p, [c.id]: pending }));
                setConvs((prev) => {
                  if (prev.some((item) => item.id === c.id)) return prev;
                  const firstUnpinned = prev.findIndex((item) => !conversationIsPinned(item));
                  const insertAt = firstUnpinned < 0 ? prev.length : firstUnpinned;
                  return [...prev.slice(0, insertAt), c, ...prev.slice(insertAt)];
                });
                setSelectedId(c.id);
                void reloadConvs();
              }}
            />
          )}
        </div>
      </div>
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent
          title={`删除选中的 ${selectedConversationCount} 个对话？`}
          description="对话消息和执行记录将一并删除，此操作不可撤销。"
          footer={
            <>
              <AlertDialogCancel asChild>
                <Button disabled={bulkDeleting} size="sm" variant="ghost">
                  取消
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  color="danger"
                  disabled={bulkDeleting || selectedConversationCount === 0}
                  size="sm"
                  variant="solid"
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteSelectedConversations();
                  }}
                >
                  {bulkDeleting && <Loader2Icon className="animate-spin" />}
                  {bulkDeleting ? "删除中" : "确认删除"}
                </Button>
              </AlertDialogAction>
            </>
          }
        />
      </AlertDialog>
    </div>
  );
}
