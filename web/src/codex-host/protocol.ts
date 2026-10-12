/**
 * Codex host bridge protocol — v1 (guest side / ARTEX console).
 *
 * Why this file exists: the ARTEX console runs both standalone (a normal browser tab served by
 * the Go backend) and embedded as an iframe in the Codex Desktop shell. Both sides must agree
 * on the wire format before any theme/token/route plumbing can happen, so the envelope, the
 * message-type vocabulary and the runtime type guard live here instead of being duplicated.
 *
 * Spec (v1) — both sides implement exactly this:
 *
 *   envelope: { channel: "codex-host", v: 1, type: string, id?: string, payload?: object }
 *
 *   HOST -> GUEST
 *     codex-host:init      { theme: { mode: "light"|"dark"|"system", resolved: "light"|"dark" },
 *                            tokens: Record<string, string>, locale: string }
 *     codex-host:theme     { mode: "light"|"dark"|"system", resolved: "light"|"dark" }
 *     codex-host:navigate  { path: string }
 *     codex-host:ping      { t: number }
 *
 *   GUEST -> HOST
 *     codex-host:ready     { version: string, route: string, title: string }
 *     codex-host:route     { path: string, title: string }
 *     codex-host:theme-request {}
 *     codex-host:notify    { level: "info"|"warn"|"error", message: string }
 *     codex-host:error     { message: string, source?: string }
 *     codex-host:pong      { t: number }
 *
 *   Rules:
 *     - The host accepts guest messages only from the configured guest origin.
 *     - The guest accepts host messages only from the host origin ("null" is accepted too, for
 *       file:/srcdoc embeddings).
 *     - The host sends `init` right after the iframe `load` event and re-sends it in reply to
 *       `theme-request`, because the guest may miss the first one.
 *     - The guest sends `ready` once mounted and again after every full reload.
 *     - Unknown message types are ignored, never treated as errors: only the envelope is
 *       validated strictly so both sides can add messages without breaking the other.
 */

/** Channel discriminator carried in every envelope (`channel`). */
export const CODEX_HOST_CHANNEL = "codex-host" as const;

/** Protocol version carried in every envelope (`v`). Envelopes with any other value are dropped. */
export const CODEX_HOST_PROTOCOL_VERSION = 1 as const;

/**
 * Every v1 message type, grouped by direction. A frozen map instead of inline string literals so
 * that a typo becomes a compile error on the sending side and impossible to miss on the receiving
 * side (see {@link isHostToGuestMessage} / {@link isGuestToHostMessage}).
 */
export const CODEX_HOST_TYPES = {
  /** HOST -> GUEST: full handshake (theme + tokens + locale). */
  init: "codex-host:init",
  /** HOST -> GUEST: theme-only update. */
  theme: "codex-host:theme",
  /** HOST -> GUEST: the shell asks the guest to navigate (guest decides how). */
  navigate: "codex-host:navigate",
  /** HOST -> GUEST: liveness probe. */
  ping: "codex-host:ping",
  /** GUEST -> HOST: sent once mounted, and again after every full reload. */
  ready: "codex-host:ready",
  /** GUEST -> HOST: SPA route and/or document title changed. */
  route: "codex-host:route",
  /** GUEST -> HOST: "re-send `init`, I missed it" (e.g. after a client-side theme reset). */
  themeRequest: "codex-host:theme-request",
  /** GUEST -> HOST: a message the shell should surface to the user (toast/banner). */
  notify: "codex-host:notify",
  /** GUEST -> HOST: runtime error report (window.onerror / unhandled rejection). */
  error: "codex-host:error",
  /** GUEST -> HOST: answer to `ping`, echoing the host timestamp `t`. */
  pong: "codex-host:pong",
} as const;

export type CodexHostMessageType = (typeof CODEX_HOST_TYPES)[keyof typeof CODEX_HOST_TYPES];

/** Host -> guest types. Anything else must be ignored by the guest (forward compatibility). */
export const CODEX_HOST_HOST_TO_GUEST_TYPES = [
  CODEX_HOST_TYPES.init,
  CODEX_HOST_TYPES.theme,
  CODEX_HOST_TYPES.navigate,
  CODEX_HOST_TYPES.ping,
] as const;

/** Guest -> host types. The host must ignore the rest; the guest never acts on these either. */
export const CODEX_HOST_GUEST_TO_HOST_TYPES = [
  CODEX_HOST_TYPES.ready,
  CODEX_HOST_TYPES.route,
  CODEX_HOST_TYPES.themeRequest,
  CODEX_HOST_TYPES.notify,
  CODEX_HOST_TYPES.error,
  CODEX_HOST_TYPES.pong,
] as const;

export type CodexHostThemeMode = "light" | "dark" | "system";
export type CodexHostResolvedTheme = "light" | "dark";
export type CodexHostNotifyLevel = "info" | "warn" | "error";

export interface CodexHostThemeState {
  /** What the user picked in the shell (may be "system"). */
  mode: CodexHostThemeMode;
  /** What the shell actually decided; the guest only ever applies this value. */
  resolved: CodexHostResolvedTheme;
}

/** `codex-host:init` — the shell's full state push, idempotent by design. */
export interface CodexHostInitPayload extends CodexHostThemeState {
  /** CSS custom properties (`--name`: value) to write onto `<html>`. */
  tokens: Record<string, string>;
  /** BCP-47-ish locale tag the shell currently uses. Informational for the guest. */
  locale: string;
}

export type CodexHostThemePayload = CodexHostThemeState;

export interface CodexHostNavigatePayload {
  /** App-absolute path (`/tasks?page=2`); the guest maps it onto its own router. */
  path: string;
}

export interface CodexHostPingPayload {
  /** Host clock value (ms). Echoed verbatim in `pong`. */
  t: number;
}

export type CodexHostPongPayload = CodexHostPingPayload;

export interface CodexHostReadyPayload {
  /** Guest build/protocol version, for cache-busting and compatibility checks. */
  version: string;
  /** `pathname + search` at mount time. */
  route: string;
  title: string;
}

export interface CodexHostRoutePayload {
  /** `pathname + search` after the route change. */
  path: string;
  title: string;
}

/** `codex-host:theme-request` carries an empty object per the spec. */
export type CodexHostThemeRequestPayload = Record<string, never>;

export interface CodexHostNotifyPayload {
  level: CodexHostNotifyLevel;
  message: string;
}

export interface CodexHostErrorPayload {
  message: string;
  /** Where it came from (file:line:col or a stack frame); optional by design. */
  source?: string;
}

/**
 * The v1 envelope. `type` stays `string` on purpose: the guard validates the envelope, not the
 * vocabulary, so a newer host can add a message type without being rejected by an older guest.
 */
export interface CodexHostEnvelope<TPayload extends object = object> {
  channel: typeof CODEX_HOST_CHANNEL;
  v: typeof CODEX_HOST_PROTOCOL_VERSION;
  type: string;
  /** Optional correlation id; unused by v1 traffic but reserved for request/response pairs. */
  id?: string;
  payload?: TPayload;
}

/** Envelope with a narrowed `type` (and therefore a known payload) for the receiving side. */
export type CodexHostTypedEnvelope<TType extends CodexHostMessageType, TPayload extends object> = Omit<
  CodexHostEnvelope<TPayload>,
  "type"
> & { type: TType };

export type CodexHostHostMessage =
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.init, CodexHostInitPayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.theme, CodexHostThemePayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.navigate, CodexHostNavigatePayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.ping, CodexHostPingPayload>;

export type CodexHostGuestMessage =
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.ready, CodexHostReadyPayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.route, CodexHostRoutePayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.themeRequest, CodexHostThemeRequestPayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.notify, CodexHostNotifyPayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.error, CodexHostErrorPayload>
  | CodexHostTypedEnvelope<typeof CODEX_HOST_TYPES.pong, CodexHostPongPayload>;

/**
 * Validates the envelope of an inbound `postMessage` payload.
 *
 * Why a guard instead of a cast: `event.data` is arbitrary attacker-shaped JSON from any frame
 * that happens to hold a handle to this window, so every field the bridge relies on has to be
 * checked before use. The check is deliberately envelope-only (see {@link CodexHostEnvelope}).
 */
export function isCodexHostMessage(data: unknown): data is CodexHostEnvelope {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const envelope = data as Record<string, unknown>;
  if (envelope.channel !== CODEX_HOST_CHANNEL) return false;
  if (envelope.v !== CODEX_HOST_PROTOCOL_VERSION) return false;
  if (typeof envelope.type !== "string" || envelope.type.length === 0) return false;
  if (envelope.id !== undefined && typeof envelope.id !== "string") return false;
  const { payload } = envelope;
  if (payload === undefined) return true;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

/** True when `data` is a well-formed envelope carrying a host -> guest type. */
export function isHostToGuestMessage(data: unknown): data is CodexHostHostMessage {
  return isCodexHostMessage(data) && includesType(CODEX_HOST_HOST_TO_GUEST_TYPES, data.type);
}

/** True when `data` is a well-formed envelope carrying a guest -> host type. */
export function isGuestToHostMessage(data: unknown): data is CodexHostGuestMessage {
  return isCodexHostMessage(data) && includesType(CODEX_HOST_GUEST_TO_HOST_TYPES, data.type);
}

function includesType(types: readonly string[], type: string): boolean {
  return types.includes(type);
}
