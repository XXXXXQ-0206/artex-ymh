/**
 * Shared Codex chat surface entry point.
 *
 * The page keeps ARTEX's data fetching and mutation logic, while these
 * renderers live behind the same namespace as the shell and overlay surfaces.
 * This keeps the integration boundary explicit as the chat surface grows.
 */
export { ChatTranscript } from "@/app/(main)/chat/_components/chat-transcript";
export {
  AssistantMessage,
  AttachmentChip,
  ChatEmpty,
  ErrorBlock,
  MsgMeta,
  ReasoningBlock,
  RoundDivider,
  ToolCallBlock,
  UserMessage,
} from "@/app/(main)/chat/_components/chat-blocks";
export { CodeBlock } from "@/app/(main)/chat/_components/code-block";
