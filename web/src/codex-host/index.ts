"use client";

/**
 * Codex host bridge — public entry point for the ARTEX console (guest side, protocol v1).
 *
 * Why a barrel with a "use client" directive: the bridge has a framework-agnostic core
 * (`createCodexHostClient`) plus React bindings, and it must be mounted exactly once per app
 * root. One import path keeps that honest, and puts the protocol constants/guards next to the
 * hook that uses them.
 *
 * Mount it (inside an existing client component, or any component of the root layout):
 *
 *   import { useCodexHost } from "@/codex-host";
 *   useCodexHost();
 *
 * A server-rendered `layout.tsx` can use the JSX form instead: `<CodexHostBridge />`.
 * Wire spec: ./protocol.ts — usage/options/limitations: ./README.md.
 */

export type { CodexHostClient, CodexHostClientOptions } from "./host-client";
export { CodexHostBridge, createCodexHostClient, startCodexHostClient, useCodexHost } from "./host-client";
export type {
  CodexHostEnvelope,
  CodexHostErrorPayload,
  CodexHostGuestMessage,
  CodexHostHostMessage,
  CodexHostInitPayload,
  CodexHostMessageType,
  CodexHostNavigatePayload,
  CodexHostNotifyLevel,
  CodexHostNotifyPayload,
  CodexHostPingPayload,
  CodexHostPongPayload,
  CodexHostReadyPayload,
  CodexHostResolvedTheme,
  CodexHostRoutePayload,
  CodexHostThemeMode,
  CodexHostThemePayload,
  CodexHostThemeRequestPayload,
  CodexHostThemeState,
  CodexHostTypedEnvelope,
} from "./protocol";
export {
  CODEX_HOST_CHANNEL,
  CODEX_HOST_GUEST_TO_HOST_TYPES,
  CODEX_HOST_HOST_TO_GUEST_TYPES,
  CODEX_HOST_PROTOCOL_VERSION,
  CODEX_HOST_TYPES,
  isCodexHostMessage,
  isGuestToHostMessage,
  isHostToGuestMessage,
} from "./protocol";
