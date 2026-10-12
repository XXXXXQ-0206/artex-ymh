/**
 * Guest-side host bridge for the Codex shell integration (protocol v1 — see ./protocol.ts).
 *
 * Why this exists: the ARTEX console is served standalone by the Go backend, but it is also
 * embedded as an iframe by the Codex Desktop shell. Embedded, the shell owns the window chrome,
 * the design tokens and the navigation, so the console must accept theme/token pushes, report its
 * route and title back, forward runtime errors, and answer the shell's health checks. Standalone
 * it must be completely inert: no listeners, no postMessage traffic, no side effects.
 *
 * Design rules:
 * - Framework agnostic core: {@link createCodexHostClient} only needs `window`/`document`, so the
 *   same client can be mounted from any renderer. React enters only through {@link useCodexHost}
 *   and {@link CodexHostBridge} at the bottom of this file.
 * - Never throw: DOM access is guarded and listener bodies swallow their failures, because an
 *   exception inside a `message`/`error` listener is invisible to the embedding page.
 * - Idempotent lifecycle: `start()` and `dispose()` are safe to call repeatedly, and a disposed
 *   client can be started again (React StrictMode mounts every effect twice in development).
 * - Security: inbound traffic is filtered by envelope, by origin allowlist and by window identity
 *   (only the embedding parent may drive the guest), in that order.
 */

import { useEffect, useRef } from "react";

import {
  CODEX_HOST_CHANNEL,
  CODEX_HOST_PROTOCOL_VERSION,
  CODEX_HOST_TYPES,
  type CodexHostEnvelope,
  type CodexHostErrorPayload,
  type CodexHostNotifyLevel,
  type CodexHostNotifyPayload,
  type CodexHostResolvedTheme,
  isHostToGuestMessage,
} from "./protocol";

/** Router bursts (pushState + replaceState + popstate) must collapse into one route report. */
/** localStorage key the console stores its access token under (src/lib/auth.ts: TOKEN_KEY). */
const DEFAULT_TOKEN_KEY = "artex_token";

const DEFAULT_ROUTE_DEBOUNCE_MS = 150;

/** Error storms (render loops, retry storms) must not flood the shell channel. */
const DEFAULT_ERROR_THROTTLE_MS = 1000;

/** Only real CSS custom property names are written; everything else is a bug or an attack. */
const TOKEN_NAME_PATTERN = /^--[a-z0-9-]+$/i;

/** `?codex-host=1` forces the bridge on for a top-level page (manual QA / dev harness). */
const EMBED_QUERY_PARAM = "codex-host";

/** Optional companion param: comma-separated origins the shell will post from. */
const HOST_ORIGIN_QUERY_PARAM = "codex-host-origin";

/** Opaque origin of file:/srcdoc embeddings; valid as an `event.origin`, never as a target origin. */
const NULL_ORIGIN = "null";

/** "Send to whoever is out there" — the only usable target for file:/srcdoc parents. */
const ANY_ORIGIN = "*";

/** Error reports are diagnostics; keep each one small enough to stay a cheap postMessage. */
const MAX_DESCRIPTION_LENGTH = 500;

export interface CodexHostClientOptions {
  /**
   * Force the bridge on/off. Default: auto — active only when embedded (`window.parent !== window`)
   * or when the URL carries `?codex-host=1`. Inert clients install nothing and post nothing, which
   * is what keeps a standalone ARTEX tab free of bridge side effects.
   */
  enabled?: boolean;
  /**
   * Origins accepted for inbound host messages. Default: auto-detected from
   * `location.ancestorOrigins` (Chromium/Electron), `document.referrer` and the "null" origin.
   * Pass this when the shell strips the referrer and is not Chromium; when set, only these origins
   * (plus "null") are accepted, so an explicit configuration always wins over detection.
   */
  hostOrigins?: readonly string[];
  /** Origin used when posting to the shell. Default: the embedder origin, else "*". */
  targetOrigin?: string;
  /** Value reported as `version` in `codex-host:ready`. Defaults to the protocol version. */
  version?: string;
  /** Route report debounce in ms. Default 150. */
  routeDebounceMs?: number;
  /** Window-error throttle in ms. Default 1000. */
  errorThrottleMs?: number;
  /**
   * Handler for `codex-host:navigate`. Wiring it to the app router is the app's job (only the app
   * knows whether it uses Next's router, a hash router, ...), so without a handler navigation
   * requests are ignored instead of guessed at.
   */
  onNavigate?: (path: string) => void;
  /**
   * Access token handed to the shell (see `codex-host:token` in protocol.ts). Default: read
   * `artex_token` from localStorage — the shell cannot read another origin’s storage, and it
   * needs the bearer token to call the ARTEX API directly after login.
   */
  getToken?: () => string | null;
}

/**
 * A live (or inert) guest-side bridge. Every method is safe to call in any state: before
 * `start()`, after `dispose()`, in an inert client, or in an environment without a DOM.
 */
export interface CodexHostClient {
  /** True while the bridge is embedded, started and listening. */
  readonly active: boolean;
  /** Installs the listeners, applies the embed decision and announces `ready`. Idempotent. */
  start(): void;
  /** Removes every listener, restores the patched history methods and cancels timers. Idempotent. */
  dispose(): void;
  /** Asks the shell to re-send `codex-host:init` (the guest may have missed the first one). */
  requestTheme(): void;
  /** Sends a user-facing message to the shell. */
  notify(level: CodexHostNotifyLevel, message: string): void;
  /** pushes the current access token to the shell (call after login / logout). */
  sendToken(): boolean;
  /** Reports an error to the shell (throttling applies to automatic forwarding, not to this call). */
  reportError(message: string, source?: string): void;
}
/**
 * Creates the bridge but does not start it; call {@link CodexHostClient.start} (or use
 * {@link startCodexHostClient} / {@link useCodexHost}) once a DOM exists.
 */
export function createCodexHostClient(options: CodexHostClientOptions = {}): CodexHostClient {
  let started = false;
  let active = false;
  let allowAnyOrigin = false;
  let allowedOrigins: readonly string[] = [];
  let targetOrigin: string = ANY_ORIGIN;
  let runtimeWindow: Window | undefined;
  let routeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRouteToken = "";
  let lastErrorAt = 0;
  let forwardingError = false;
  let originalPushState: History["pushState"] | undefined;
  let originalReplaceState: History["replaceState"] | undefined;
  let patchedPushState: History["pushState"] | undefined;
  let patchedReplaceState: History["replaceState"] | undefined;

  const routeDebounceMs = options.routeDebounceMs ?? DEFAULT_ROUTE_DEBOUNCE_MS;
  const errorThrottleMs = options.errorThrottleMs ?? DEFAULT_ERROR_THROTTLE_MS;
  const readyVersion = options.version ?? String(CODEX_HOST_PROTOCOL_VERSION);

  function start(): void {
    if (started) return;
    const win = getWindow();
    const doc = getDocument();
    // No DOM (SSR, worker, plain node): stay inert and let a later start() retry.
    if (!win || !doc) return;
    started = true;
    if (!isBridgeEnabled(win, options)) return;

    const resolved = resolveAllowedOrigins(win, doc, options);
    allowedOrigins = resolved.origins;
    allowAnyOrigin = resolved.allowAny;
    targetOrigin = resolveTargetOrigin(win, doc, options, allowedOrigins);
    runtimeWindow = win;
    active = true;

    win.addEventListener("message", handleMessage);
    win.addEventListener("popstate", handlePopState);
    win.addEventListener("error", handleWindowError);
    win.addEventListener("unhandledrejection", handleUnhandledRejection);
    patchHistory(win);

    const route = currentRoute();
    const title = currentTitle();
    // `ready` already announces the route, so seeding the dedupe token avoids a duplicate report
    // on the first router call that changes nothing.
    lastRouteToken = routeToken(route, title);
    post(CODEX_HOST_TYPES.ready, { version: readyVersion, route, title });
    // Right after `ready`, hand the shell the access token it needs to call the API itself
    // (see protocol.ts `token`). Empty string means "not logged in" — the shell must not guess.
    postToken();
  }

  function dispose(): void {
    const win = runtimeWindow;
    if (win) {
      win.removeEventListener("message", handleMessage);
      win.removeEventListener("popstate", handlePopState);
      win.removeEventListener("error", handleWindowError);
      win.removeEventListener("unhandledrejection", handleUnhandledRejection);
      restoreHistory(win);
    }
    if (routeTimer !== undefined) {
      clearTimeout(routeTimer);
      routeTimer = undefined;
    }
    runtimeWindow = undefined;
    started = false;
    active = false;
    forwardingError = false;
    lastRouteToken = "";
    allowedOrigins = [];
    allowAnyOrigin = false;
    targetOrigin = ANY_ORIGIN;
  }

  /** Hands the shell the current access token; safe to call any time (login, logout, refresh). */
  function postToken(): boolean {
    return post(CODEX_HOST_TYPES.token, { token: readToken() ?? "" });
  }

  function readToken(): string | null {
    const fromOption = options.getToken;
    if (fromOption) {
      try {
        const value = fromOption();
        if (typeof value === "string") return value;
      } catch (error) {
        noteInternalFailure(error);
      }
    }
    try {
      return getWindow()?.localStorage?.getItem(DEFAULT_TOKEN_KEY) ?? null;
    } catch (error) {
      noteInternalFailure(error);
      return null;
    }
  }

  /** Posts one envelope to the shell. Returns false when the bridge is inert or the post failed. */
  function post(type: string, payload?: object): boolean {
    if (!active) return false;
    const win = runtimeWindow ?? getWindow();
    if (!win) return false;
    const target = win.parent && win.parent !== win ? win.parent : win;
    const envelope: CodexHostEnvelope = {
      channel: CODEX_HOST_CHANNEL,
      v: CODEX_HOST_PROTOCOL_VERSION,
      type,
    };
    if (payload) envelope.payload = payload;
    try {
      target.postMessage(envelope, targetOrigin);
      return true;
    } catch (error) {
      noteInternalFailure(error);
      return false;
    }
  }

  function requestTheme(): void {
    post(CODEX_HOST_TYPES.themeRequest, {});
  }

  function notify(level: CodexHostNotifyLevel, message: string): void {
    if (!active) return;
    const payload: CodexHostNotifyPayload = {
      level: level === "warn" || level === "error" ? level : "info",
      message: normalizeText(message),
    };
    post(CODEX_HOST_TYPES.notify, payload);
  }

  /**
   * Manual reports are never throttled: the caller already decided this error matters. The
   * automatic window/rejection forwarding below shares the wire format but is throttled.
   */
  function reportError(message: string, source?: string): void {
    if (!active) return;
    post(CODEX_HOST_TYPES.error, buildErrorPayload(normalizeText(message), cleanSource(source)));
  }
  function handleMessage(event: MessageEvent): void {
    try {
      if (!active) return;
      if (!isFromHost(event)) return;
      if (!isHostToGuestMessage(event.data)) return;
      const { payload } = event.data;
      switch (event.data.type) {
        case CODEX_HOST_TYPES.init:
          // init is the full handshake (theme + tokens) and may arrive more than once.
          applyTheme(payload);
          applyTokens(payload);
          return;
        case CODEX_HOST_TYPES.theme:
          applyTheme(payload);
          return;
        case CODEX_HOST_TYPES.ping:
          post(CODEX_HOST_TYPES.pong, { t: readPingTimestamp(payload) });
          return;
        case CODEX_HOST_TYPES.navigate:
          handleNavigate(payload);
          return;
        default:
          // Unknown/future type: ignored on purpose, only the envelope had to be valid.
          return;
      }
    } catch (error) {
      noteInternalFailure(error);
    }
  }

  function applyTheme(payload: unknown): void {
    const resolved = readResolvedTheme(payload);
    if (!resolved) return;
    const root = getDocument()?.documentElement;
    if (!root) return;
    // `dark` drives ARTEX/Tailwind styles, `data-theme` drives the Codex token bridge
    // (src/styles/codex/codex-bridge.css keys on html.dark and [data-theme="dark"]).
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
  }

  function applyTokens(payload: unknown): void {
    const root = getDocument()?.documentElement;
    if (!root) return;
    const tokens = isRecord(payload) ? payload.tokens : undefined;
    if (!isRecord(tokens)) return;
    for (const [name, value] of Object.entries(tokens)) {
      if (!TOKEN_NAME_PATTERN.test(name) || typeof value !== "string") continue;
      root.style.setProperty(name, value);
    }
  }

  function handleNavigate(payload: unknown): void {
    const path = isRecord(payload) ? payload.path : undefined;
    // Only app-absolute, single-slash paths: "//evil.example" and "javascript:" are not routes.
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return;
    const handler = options.onNavigate;
    if (!handler) return;
    try {
      handler(path);
    } catch (error) {
      noteInternalFailure(error);
    }
  }

  function handlePopState(): void {
    scheduleRouteReport();
  }

  function scheduleRouteReport(): void {
    if (!active) return;
    if (routeTimer !== undefined) clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      routeTimer = undefined;
      reportRoute();
    }, routeDebounceMs);
  }

  function reportRoute(): void {
    const path = currentRoute();
    const title = currentTitle();
    const token = routeToken(path, title);
    if (token === lastRouteToken) return;
    lastRouteToken = token;
    post(CODEX_HOST_TYPES.route, { path, title });
  }

  function handleWindowError(event: ErrorEvent): void {
    try {
      const message =
        typeof event.message === "string" && event.message.length > 0 ? event.message : describeUnknown(event.error);
      forwardError(message, describeErrorLocation(event));
    } catch (error) {
      noteInternalFailure(error);
    }
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    try {
      const description = describeReason(event.reason);
      forwardError(description.message, description.source);
    } catch (error) {
      noteInternalFailure(error);
    }
  }

  /**
   * Automatic error forwarding: at most one report per `errorThrottleMs`, and re-entrancy is
   * blocked so an error raised while reporting (or by the shell's own postMessage handler) can
   * never recurse into this function again.
   */
  function forwardError(message: string, source?: string): void {
    if (!active || forwardingError) return;
    const now = Date.now();
    if (now - lastErrorAt < errorThrottleMs) return;
    lastErrorAt = now;
    forwardingError = true;
    try {
      post(CODEX_HOST_TYPES.error, buildErrorPayload(normalizeText(message), cleanSource(source)));
    } finally {
      forwardingError = false;
    }
  }

  function isFromHost(event: MessageEvent): boolean {
    const win = runtimeWindow;
    if (!win || typeof event.origin !== "string") return false;
    const { parent } = win;
    const embedded = Boolean(parent) && parent !== win;
    // Window identity first: only the frame that embeds us may drive us. A same-origin sibling
    // frame holding a handle to this window is dropped here even when its origin is allowed.
    if (embedded && event.source !== parent) return false;
    return isAllowedOrigin(event.origin);
  }

  function isAllowedOrigin(origin: string): boolean {
    // An empty list only happens while inert; allowAnyOrigin is the "could not be pinned" case.
    if (allowAnyOrigin || allowedOrigins.length === 0) return true;
    return allowedOrigins.includes(origin);
  }

  function patchHistory(win: Window): void {
    const { history } = win;
    if (!history) return;
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    patchedPushState = createPatchedHistoryMethod(history, originalPushState, scheduleRouteReport);
    patchedReplaceState = createPatchedHistoryMethod(history, originalReplaceState, scheduleRouteReport);
    history.pushState = patchedPushState;
    history.replaceState = patchedReplaceState;
  }

  function restoreHistory(win: Window): void {
    const { history } = win;
    if (history) {
      // Identity check: never clobber a patch installed by somebody else after ours.
      if (originalPushState && patchedPushState && history.pushState === patchedPushState) {
        history.pushState = originalPushState;
      }
      if (originalReplaceState && patchedReplaceState && history.replaceState === patchedReplaceState) {
        history.replaceState = originalReplaceState;
      }
    }
    originalPushState = undefined;
    originalReplaceState = undefined;
    patchedPushState = undefined;
    patchedReplaceState = undefined;
  }

  return {
    get active(): boolean {
      return active;
    },
    start,
    dispose,
    requestTheme,
    sendToken: postToken,
    notify,
    reportError,
  };
}
/** Reads `window` at call time so the client can be created before a DOM exists (SSR). */
function getWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** Reads `document` at call time; falls back to `window.document` for exotic hosts and tests. */
function getDocument(): Document | undefined {
  if (typeof document !== "undefined") return document;
  return getWindow()?.document;
}

/** Default activation rule: embedded iframe, or an explicit `?codex-host=1` opt-in. */
function isBridgeEnabled(win: Window, options: CodexHostClientOptions): boolean {
  if (options.enabled !== undefined) return options.enabled;
  if (win.parent && win.parent !== win) return true;
  return hasEmbedFlag(win);
}

function hasEmbedFlag(win: Window): boolean {
  try {
    const search = win.location?.search ?? "";
    return new URLSearchParams(search).get(EMBED_QUERY_PARAM) === "1";
  } catch (error) {
    noteInternalFailure(error);
    return false;
  }
}

interface OriginResolution {
  origins: string[];
  /** True when no host origin could be pinned and window identity is the only gate left. */
  allowAny: boolean;
}

/**
 * Builds the inbound origin allowlist. Explicit configuration wins over detection so an embedder
 * that knows its own origin can lock the guest down even when the referrer is stripped.
 */
function resolveAllowedOrigins(win: Window, doc: Document, options: CodexHostClientOptions): OriginResolution {
  const configured = options.hostOrigins ?? readConfiguredOrigins(win.location);
  if (configured.length > 0) {
    const origins = new Set<string>();
    let allowAny = false;
    for (const entry of configured) {
      const origin = normalizeOrigin(entry);
      if (origin === ANY_ORIGIN) allowAny = true;
      else if (origin) origins.add(origin);
    }
    origins.add(NULL_ORIGIN);
    return { origins: [...origins], allowAny };
  }

  const detected = new Set<string>();
  for (const origin of readAncestorOrigins(win)) {
    const normalized = normalizeOrigin(origin);
    if (normalized) detected.add(normalized);
  }
  // A referrer pointing at the guest itself is not a host: that is what a guest-driven full
  // navigation leaves behind (2026-10-13 真机实测), and letting it into the allowlist would also
  // poison the target-origin fallback below.
  const referrerOrigin = normalizeOrigin(doc.referrer);
  if (referrerOrigin && referrerOrigin !== selfOriginOf(win)) detected.add(referrerOrigin);
  const allowAny = detected.size === 0;
  if (allowAny) {
    devWarn("host origin could not be detected; only the embedding window may send messages");
  }
  detected.add(NULL_ORIGIN);
  return { origins: [...detected], allowAny };
}

/** 本帧自己的 origin（normalizeOrigin 口径：file:/about:blank 归一到 "null"）。 */
function selfOriginOf(win: Window): string | undefined {
  return normalizeOrigin(win.location?.origin);
}

function readConfiguredOrigins(loc: Location | undefined): string[] {
  try {
    const raw = new URLSearchParams(loc?.search ?? "").get(HOST_ORIGIN_QUERY_PARAM) ?? "";
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch (error) {
    noteInternalFailure(error);
    return [];
  }
}

/**
 * Chromium (i.e. Electron, the Codex shell) exposes the whole ancestor chain here; other engines
 * leave it undefined at runtime even though lib.dom always declares it, hence the runtime guard.
 */
function readAncestorOrigins(win: Window): string[] {
  try {
    const list: DOMStringList | undefined = win.location?.ancestorOrigins;
    if (!list || typeof list.length !== "number") return [];
    const origins: string[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const origin = typeof list.item === "function" ? list.item(index) : null;
      if (typeof origin === "string" && origin.length > 0) origins.push(origin);
    }
    return origins;
  } catch (error) {
    noteInternalFailure(error);
    return [];
  }
}

/**
 * Normalizes a user-supplied origin and returns "null" for file:/srcdoc, "*" for the explicit
 * any-origin opt-in, and undefined for anything that is not an absolute origin (a bare
 * "localhost:5173" parses as a scheme and would silently become "null", so it is rejected).
 */
function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed === ANY_ORIGIN) return ANY_ORIGIN;
  if (trimmed === NULL_ORIGIN) return NULL_ORIGIN;
  if (!trimmed.includes("://")) return undefined;
  try {
    const { origin } = new URL(trimmed);
    return origin === NULL_ORIGIN || origin.length === 0 ? NULL_ORIGIN : origin;
  } catch (error) {
    noteInternalFailure(error);
    return undefined;
  }
}

/**
 * Picks the origin we post to.
 *
 * Order (2026-10-13 changed): **the nearest ancestor origin wins over `document.referrer`.**
 * Why: `referrer` describes the document that loaded *this* navigation. When the guest navigates
 * itself (login bounce, a plain link, `location.assign`) the new document's referrer is the
 * guest's *own* URL, so posting with it makes the browser drop every outbound message silently
 * (targetOrigin mismatch) — measured in the real shell: `ready`/`route`/`pong` all stopped while
 * inbound kept working (`ancestorOrigins` still pointed at the host). `location.ancestorOrigins`
 * is ordered closest-first in Chromium (the shell), so index 0 is the direct parent regardless of
 * who started the navigation.
 */
function resolveTargetOrigin(
  win: Window,
  doc: Document,
  options: CodexHostClientOptions,
  allowed: readonly string[],
): string {
  const configured = normalizeOrigin(options.targetOrigin);
  if (configured && configured !== NULL_ORIGIN) return configured;

  const ancestors = readAncestorOrigins(win)
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin) && origin !== NULL_ORIGIN);
  if (ancestors.length > 0) return ancestors[0];

  // Fallback for engines without ancestorOrigins: the referrer is only usable when it is not the
  // guest itself (a self-referrer means the guest started this navigation → posting would miss).
  const selfOrigin = selfOriginOf(win);
  const referrerOrigin = normalizeOrigin(doc.referrer);
  if (referrerOrigin && referrerOrigin !== NULL_ORIGIN && referrerOrigin !== selfOrigin) {
    return referrerOrigin;
  }

  const specific = allowed.filter((origin) => origin !== NULL_ORIGIN && origin !== selfOrigin);
  if (specific.length === 1) return specific[0];
  // "null" is not a valid target origin, so file:/srcdoc parents need "*".
  return ANY_ORIGIN;
}

function createPatchedHistoryMethod(
  history: History,
  original: History["pushState"],
  onChange: () => void,
): History["pushState"] {
  return (...args: Parameters<History["pushState"]>): void => {
    original.apply(history, args);
    onChange();
  };
}
function currentRoute(): string {
  const loc = getWindow()?.location;
  if (!loc) return "/";
  return `${loc.pathname}${loc.search}`;
}

function currentTitle(): string {
  return getDocument()?.title ?? "";
}

/** Route + title together, because a title-only change is still worth reporting to the shell. */
function routeToken(path: string, title: string): string {
  return `${path}\u0000${title}`;
}

function readPingTimestamp(payload: unknown): number {
  const value = isRecord(payload) ? payload.t : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The guest applies `resolved`, never the user's "system" preference (the shell resolves it).
 * Both wire shapes are accepted: `{ theme: { resolved } }` (init) and `{ resolved }` (theme),
 * and a host that only sent a concrete `mode` is tolerated.
 */
function readResolvedTheme(payload: unknown): CodexHostResolvedTheme | undefined {
  if (!isRecord(payload)) return undefined;
  const state = isRecord(payload.theme) ? payload.theme : payload;
  const { resolved, mode } = state;
  if (resolved === "dark" || resolved === "light") return resolved;
  if (mode === "dark" || mode === "light") return mode;
  return undefined;
}

function normalizeText(message: unknown): string {
  if (typeof message !== "string") return describeUnknown(message);
  return message.length > MAX_DESCRIPTION_LENGTH ? `${message.slice(0, MAX_DESCRIPTION_LENGTH)}...` : message;
}

function cleanSource(source: unknown): string | undefined {
  return typeof source === "string" && source.length > 0 ? source : undefined;
}

function buildErrorPayload(message: string, source?: string): CodexHostErrorPayload {
  return source ? { message, source } : { message };
}

function describeReason(reason: unknown): { message: string; source?: string } {
  if (!(reason instanceof Error)) return { message: describeUnknown(reason) };
  const message = reason.name ? `${reason.name}: ${reason.message}` : reason.message;
  const frame = typeof reason.stack === "string" ? reason.stack.split("\n")[1] : undefined;
  const source = typeof frame === "string" ? frame.trim() : "";
  return source.length > 0 ? { message, source } : { message };
}

function describeErrorLocation(event: ErrorEvent): string | undefined {
  const filename = typeof event.filename === "string" ? event.filename : "";
  if (filename.length === 0) return undefined;
  const line = typeof event.lineno === "number" && event.lineno > 0 ? event.lineno : 0;
  const column = typeof event.colno === "number" && event.colno > 0 ? event.colno : 0;
  return line > 0 ? `${filename}:${line}:${column}` : filename;
}

/** Best-effort text for values that are not `Error` instances; never throws on cycles/odd objects. */
function describeUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "unknown error";
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") {
      return json.length > MAX_DESCRIPTION_LENGTH ? `${json.slice(0, MAX_DESCRIPTION_LENGTH)}...` : json;
    }
  } catch (error) {
    noteInternalFailure(error);
  }
  return Object.prototype.toString.call(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDev(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

function devWarn(message: string): void {
  if (isDev()) console.warn(`[codex-host] ${message}`);
}

/**
 * A bridge failure must never become the page's failure: listener bodies log in development and
 * return quietly in production instead of rethrowing into the host page's error path.
 */
function noteInternalFailure(error: unknown): void {
  if (isDev()) console.warn("[codex-host] ignored bridge failure:", error);
}

/**
 * Convenience for non-React mounts: create + start in one call. The returned client is the handle
 * to `dispose()` with, so nothing is leaked when the caller keeps it.
 */
export function startCodexHostClient(options: CodexHostClientOptions = {}): CodexHostClient {
  const client = createCodexHostClient(options);
  client.start();
  return client;
}

/**
 * Starts the bridge for the lifetime of the calling component and disposes it on unmount.
 *
 * Why a ref instead of dependencies: the client is a long-lived listener, so re-creating it on
 * every render would re-install the history patches, re-announce `ready` and drop the route
 * dedupe state. Live options are therefore read through a ref while the effect itself runs once.
 */
export function useCodexHost(options: CodexHostClientOptions = {}): void {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // The bridge is a long-lived listener: start it once per mount, not on every option change.
  useEffect(() => {
    const client = createCodexHostClient(optionsRef.current);
    client.start();
    return () => client.dispose();
  }, []);
}

/**
 * Renders nothing but mounts the bridge, so a server-rendered layout can wire it up with a single
 * JSX tag (`<CodexHostBridge />`) instead of having to become a client component itself.
 */
export function CodexHostBridge(options: CodexHostClientOptions = {}): null {
  useCodexHost(options);
  return null;
}