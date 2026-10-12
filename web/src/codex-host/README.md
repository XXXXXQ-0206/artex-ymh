# Codex host bridge — guest side (protocol v1)

ARTEX console ⇄ Codex Desktop shell. Normally the console is a plain page; when the shell embeds
it in an iframe (or it is opened with `?codex-host=1`) this bridge makes it a guest: it applies
the shell's theme and design tokens, reports route/title, forwards runtime errors and answers
pings. Standalone it is completely inert — no listeners, no `postMessage`, no DOM writes — and
`dispose()` removes everything it did install.

## Mounting (one line, in the app root)

```tsx
useCodexHost(); // in an existing client component ("use client"), once per app
```

`src/app/layout.tsx` is a server component, so either call the hook from a `"use client"` component
the layout already renders, or use the JSX form (renders nothing): `<CodexHostBridge />`, imported
from `@/codex-host`. `useCodexHost({ onNavigate })` also lets the shell drive navigation; without
that handler `codex-host:navigate` is ignored on purpose (only the app knows its router).

## Protocol (v1)

Envelope: `{ channel: "codex-host", v: 1, type: string, id?: string, payload?: object }`.
Guest → host: `ready` (version + route + title, once mounted), `route` (debounced SPA change),
`theme-request`, `notify`, `error` (window errors/rejections, max 1/s), `pong`.
Host → guest: `init` (theme + `--token` map), `theme`, `navigate`, `ping`. Payload types and the
`isCodexHostMessage` guard live in `protocol.ts`.

## Behaviour and limits

- Inbound traffic must pass the envelope guard, the origin allowlist (`ancestorOrigins`,
  `document.referrer`, `"null"` for file:/srcdoc, explicit `hostOrigins`) and the window identity
  check (`event.source === window.parent`).
- Outbound posts target the embedder origin, falling back to `"*"` only when it cannot be found.
- Errors are throttled to one per second and can never re-enter the bridge.
- Only `pushState`/`replaceState`/`popstate` are observed: a title change without a router call is
  not reported.
- Self-check: `node src/codex-host/host-client.test.mjs` (dependency-free, stubs window/document).
