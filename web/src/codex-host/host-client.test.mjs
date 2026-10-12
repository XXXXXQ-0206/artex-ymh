/**
 * Dependency-free self-check for the Codex host bridge (guest side).
 *
 * Why: the bridge has to behave correctly in a browser that is not available here, so this file
 * stubs the minimal `window`/`document` surface and drives the real client through the real
 * protocol: envelope guard, embed detection, theme/token application, origin + source filtering,
 * route reporting, error throttling and teardown.
 *
 * Run with: node src/codex-host/host-client.test.mjs
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// The bridge uses bundler-style relative imports ("from ./protocol"), which Node's ESM resolver
// does not apply. A tiny resolve hook keeps this self-check dependency-free (no transpiler, no
// test framework beyond node:test) while still exercising the real modules.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { createCodexHostClient, startCodexHostClient } = await import("./host-client.ts");
const { CODEX_HOST_TYPES, isCodexHostMessage, isHostToGuestMessage } = await import("./protocol.ts");

const HOST_ORIGIN = "http://localhost:5173";
const GUEST_ORIGIN = "http://localhost:8787";

function createHarness(options = {}) {
  const {
    search = "",
    pathname = "/dashboard",
    title = "ARTEX",
    embedded = true,
    referrer = `${HOST_ORIGIN}/`,
    ancestorOrigins = [HOST_ORIGIN],
    postMessage,
  } = options;

  const listeners = new Map();
  const posted = [];
  const classes = new Set();
  const styles = new Map();
  const historyCalls = [];

  const documentElement = {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    dataset: {},
    style: {
      setProperty(name, value) {
        styles.set(name, value);
      },
    },
  };

  const doc = { title, referrer, documentElement };

  const history = {
    pushState(_data, _title, url) {
      historyCalls.push(["pushState", url]);
    },
    replaceState(_data, _title, url) {
      historyCalls.push(["replaceState", url]);
    },
  };
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const win = {
    document: doc,
    history,
    location: {
      pathname,
      search,
      origin: GUEST_ORIGIN,
      ancestorOrigins: ancestorOrigins
        ? { length: ancestorOrigins.length, item: (index) => ancestorOrigins[index] ?? null }
        : undefined,
    },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler(event);
    },
    listenerCount() {
      let total = 0;
      for (const handlers of listeners.values()) total += handlers.size;
      return total;
    },
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin });
    },
  };

  const parent = {
    postMessage(message, targetOrigin) {
      if (postMessage) postMessage({ message, targetOrigin, posted });
      posted.push({ message, targetOrigin });
    },
  };
  win.parent = embedded ? parent : win;

  return { win, doc, posted, classes, styles, historyCalls, history, parent, originalPushState, originalReplaceState };
}

function install(h) {
  globalThis.window = h.win;
  globalThis.document = h.doc;
}

function uninstall() {
  delete globalThis.window;
  delete globalThis.document;
}

function envelope(type, payload) {
  const message = { channel: "codex-host", v: 1, type };
  if (payload !== undefined) message.payload = payload;
  return message;
}

/** One inbound host message, as the browser would deliver it to the iframe. */
function hostEvent(type, payload, overrides = {}) {
  return { origin: HOST_ORIGIN, source: null, data: envelope(type, payload), ...overrides };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messagesOfType(h, type) {
  return h.posted.filter((entry) => entry.message.type === type);
}

test("isCodexHostMessage accepts well-formed v1 envelopes only", () => {
  assert.equal(isCodexHostMessage(envelope(CODEX_HOST_TYPES.ping, { t: 1 })), true);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "codex-host:future" }), true);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "x", id: "42" }), true);

  assert.equal(isCodexHostMessage(undefined), false);
  assert.equal(isCodexHostMessage(null), false);
  assert.equal(isCodexHostMessage("codex-host"), false);
  assert.equal(isCodexHostMessage([]), false);
  assert.equal(isCodexHostMessage({ channel: "other", v: 1, type: "x" }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 2, type: "x" }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "" }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: 7 }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "x", id: 7 }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "x", payload: "no" }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "x", payload: null }), false);
  assert.equal(isCodexHostMessage({ channel: "codex-host", v: 1, type: "x", payload: [] }), false);
});

test("isHostToGuestMessage keeps guest->host traffic out", () => {
  assert.equal(isHostToGuestMessage(envelope(CODEX_HOST_TYPES.init, {})), true);
  assert.equal(isHostToGuestMessage(envelope(CODEX_HOST_TYPES.ready, {})), false);
  assert.equal(isHostToGuestMessage(envelope(CODEX_HOST_TYPES.error, {})), false);
  assert.equal(isHostToGuestMessage(envelope("codex-host:future")), false);
});
test("standalone page stays completely inert", () => {
  const h = createHarness({ embedded: false, search: "" });
  install(h);
  try {
    const client = createCodexHostClient();
    client.start();
    assert.equal(client.active, false);
    assert.equal(h.win.listenerCount(), 0);
    assert.equal(h.posted.length, 0);

    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.init, { theme: { resolved: "dark" }, tokens: {} }));
    client.notify("info", "ignored");
    client.reportError("ignored");
    client.requestTheme();
    assert.equal(h.classes.has("dark"), false);
    assert.equal(h.posted.length, 0);
    client.dispose();
  } finally {
    uninstall();
  }
});

test("enabled:false stays inert even when embedded", () => {
  const h = createHarness();
  install(h);
  try {
    const client = startCodexHostClient({ enabled: false });
    assert.equal(client.active, false);
    assert.equal(h.win.listenerCount(), 0);
    assert.equal(h.posted.length, 0);
    client.dispose();
  } finally {
    uninstall();
  }
});

test("a top-level page is activated by ?codex-host=1", () => {
  const h = createHarness({ embedded: false, search: "?codex-host=1" });
  install(h);
  try {
    const client = startCodexHostClient();
    assert.equal(client.active, true);
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.ready).length, 1);
    client.dispose();
  } finally {
    uninstall();
  }
});

test("embedded client announces ready and applies init/theme/ping", () => {
  const h = createHarness({ pathname: "/tasks", search: "?page=2", title: "Tasks" });
  install(h);
  try {
    const client = startCodexHostClient({ routeDebounceMs: 5 });
    assert.equal(client.active, true);

    const [ready] = messagesOfType(h, CODEX_HOST_TYPES.ready);
    assert.deepEqual(ready.message, {
      channel: "codex-host",
      v: 1,
      type: "codex-host:ready",
      payload: { version: "1", route: "/tasks?page=2", title: "Tasks" },
    });
    assert.equal(ready.targetOrigin, HOST_ORIGIN);

    h.win.dispatch(
      "message",
      hostEvent(
        CODEX_HOST_TYPES.init,
        {
          theme: { mode: "system", resolved: "dark" },
          tokens: { "--color-bg": "#111", "--radius": "6px", "color-bg": "#fff", "--bad name": "x", "--num": 5 },
          locale: "zh-CN",
        },
        { source: h.parent },
      ),
    );
    assert.equal(h.classes.has("dark"), true);
    assert.equal(h.doc.documentElement.dataset.theme, "dark");
    assert.equal(h.styles.get("--color-bg"), "#111");
    assert.equal(h.styles.get("--radius"), "6px");
    assert.equal(h.styles.has("color-bg"), false);
    assert.equal(h.styles.has("--bad name"), false);
    assert.equal(h.styles.has("--num"), false);

    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.theme, { mode: "light", resolved: "light" }, { source: h.parent }),
    );
    assert.equal(h.classes.has("dark"), false);
    assert.equal(h.doc.documentElement.dataset.theme, "light");

    client.requestTheme();
    const [themeRequest] = messagesOfType(h, CODEX_HOST_TYPES.themeRequest);
    assert.deepEqual(themeRequest.message.payload, {});

    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.ping, { t: 1234 }, { source: h.parent }));
    const [pong] = messagesOfType(h, CODEX_HOST_TYPES.pong);
    assert.equal(pong.message.payload.t, 1234);

    client.notify("warn", "watch out");
    assert.deepEqual(messagesOfType(h, CODEX_HOST_TYPES.notify)[0].message.payload, {
      level: "warn",
      message: "watch out",
    });

    client.reportError("manual failure", "app.js:1:2");
    assert.deepEqual(messagesOfType(h, CODEX_HOST_TYPES.error)[0].message.payload, {
      message: "manual failure",
      source: "app.js:1:2",
    });

    client.dispose();
  } finally {
    uninstall();
  }
});

test("navigate is only forwarded through the app-supplied handler", () => {
  const h = createHarness();
  const paths = [];
  install(h);
  try {
    const client = startCodexHostClient({ onNavigate: (path) => paths.push(path), routeDebounceMs: 5 });
    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.navigate, { path: "/findings/7" }, { source: h.parent }));
    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.navigate, { path: "//evil.example" }, { source: h.parent }));
    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.navigate, { path: "https://evil.example" }, { source: h.parent }),
    );
    assert.deepEqual(paths, ["/findings/7"]);
    client.dispose();
  } finally {
    uninstall();
  }
});

test("host messages are filtered by source window, origin and envelope", () => {
  const h = createHarness();
  install(h);
  try {
    const client = startCodexHostClient({ routeDebounceMs: 5 });
    const init = { theme: { resolved: "dark" }, tokens: {} };

    // Wrong origin.
    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.init, init, { origin: "http://evil.example", source: h.parent }),
    );
    assert.equal(h.classes.has("dark"), false);

    // Right origin, but not our parent window.
    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.init, init, { source: {} }));
    assert.equal(h.classes.has("dark"), false);

    // Broken envelope (wrong protocol version).
    h.win.dispatch("message", {
      origin: HOST_ORIGIN,
      source: h.parent,
      data: { channel: "codex-host", v: 2, type: "codex-host:init", payload: init },
    });
    assert.equal(h.classes.has("dark"), false);

    // Guest -> host traffic is never acted on.
    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.ready, { version: "1" }, { source: h.parent }));
    assert.equal(h.classes.has("dark"), false);

    // Opaque origin is accepted for file:/srcdoc embeddings.
    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.init, init, { origin: "null", source: h.parent }));
    assert.equal(h.classes.has("dark"), true);

    client.dispose();
  } finally {
    uninstall();
  }
});

test("explicit hostOrigins win over detection and reject everything else", () => {
  const h = createHarness();
  install(h);
  try {
    const client = startCodexHostClient({ hostOrigins: ["http://shell.example"], routeDebounceMs: 5 });
    const init = { theme: { resolved: "dark" }, tokens: {} };

    h.win.dispatch("message", hostEvent(CODEX_HOST_TYPES.init, init, { origin: HOST_ORIGIN, source: h.parent }));
    assert.equal(h.classes.has("dark"), false);

    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.init, init, { origin: "http://shell.example", source: h.parent }),
    );
    assert.equal(h.classes.has("dark"), true);
    client.dispose();
  } finally {
    uninstall();
  }
});
test("SPA route changes are debounced, de-duplicated and torn down", async () => {
  const h = createHarness({ pathname: "/dashboard", search: "" });
  install(h);
  try {
    const client = startCodexHostClient({ routeDebounceMs: 5 });

    h.win.location.pathname = "/tasks";
    h.win.history.pushState({}, "", "/tasks");
    await sleep(30);
    const routes = messagesOfType(h, CODEX_HOST_TYPES.route);
    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].message.payload, { path: "/tasks", title: "ARTEX" });

    // Same route again (replaceState churn): no duplicate report.
    h.win.history.replaceState({}, "", "/tasks");
    await sleep(30);
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.route).length, 1);

    // back/forward is observed through popstate.
    h.win.location.pathname = "/findings";
    h.doc.title = "Findings";
    h.win.dispatch("popstate", {});
    await sleep(30);
    const afterBack = messagesOfType(h, CODEX_HOST_TYPES.route);
    assert.equal(afterBack.length, 2);
    assert.deepEqual(afterBack[1].message.payload, { path: "/findings", title: "Findings" });

    client.dispose();
    assert.equal(h.win.history.pushState, h.originalPushState);
    assert.equal(h.win.history.replaceState, h.originalReplaceState);
    assert.equal(h.win.listenerCount(), 0);

    h.win.location.pathname = "/after-dispose";
    h.win.history.pushState({}, "", "/after-dispose");
    await sleep(30);
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.route).length, 2);
  } finally {
    uninstall();
  }
});

test("window errors and rejections are forwarded at most once per throttle window", () => {
  const h = createHarness();
  install(h);
  try {
    const client = startCodexHostClient({ errorThrottleMs: 1000 });
    h.win.dispatch("error", {
      message: "boom",
      filename: "http://localhost:8787/app.js",
      lineno: 12,
      colno: 3,
      error: new Error("boom"),
    });
    h.win.dispatch("error", { message: "second", error: new Error("second") });

    const errors = messagesOfType(h, CODEX_HOST_TYPES.error);
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0].message.payload, {
      message: "boom",
      source: "http://localhost:8787/app.js:12:3",
    });
    client.dispose();
  } finally {
    uninstall();
  }
});

test("rejections are described and the throttle can be disabled", () => {
  const h = createHarness();
  install(h);
  try {
    const client = startCodexHostClient({ errorThrottleMs: 0 });
    h.win.dispatch("unhandledrejection", { reason: new Error("nope") });
    h.win.dispatch("unhandledrejection", { reason: { weird: true } });

    const errors = messagesOfType(h, CODEX_HOST_TYPES.error);
    assert.equal(errors.length, 2);
    assert.equal(errors[0].message.payload.message, "Error: nope");
    assert.equal(typeof errors[0].message.payload.source, "string");
    assert.equal(errors[1].message.payload.message, '{"weird":true}');
    client.dispose();
  } finally {
    uninstall();
  }
});

test("error forwarding cannot re-enter itself", () => {
  let nested = 0;
  const h = createHarness({
    postMessage: ({ message }) => {
      if (message.type === CODEX_HOST_TYPES.error && nested === 0) {
        nested += 1;
        h.win.dispatch("error", { message: "nested", error: new Error("nested") });
      }
    },
  });
  install(h);
  try {
    const client = startCodexHostClient({ errorThrottleMs: 0 });
    h.win.dispatch("error", { message: "root", error: new Error("root") });
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.error).length, 1);
    client.dispose();
  } finally {
    uninstall();
  }
});

test("an undetectable host origin falls back to a wildcard target, gated by window identity", () => {
  const h = createHarness({ referrer: "", ancestorOrigins: null });
  const originalWarn = console.warn;
  console.warn = () => {
    // Expected here: the bridge warns when no host origin can be detected.
  };
  install(h);
  try {
    const client = startCodexHostClient();
    assert.equal(h.posted[0].targetOrigin, "*");
    const init = { theme: { resolved: "dark" }, tokens: {} };

    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.init, init, { origin: "http://somewhere.example", source: {} }),
    );
    assert.equal(h.classes.has("dark"), false);

    h.win.dispatch(
      "message",
      hostEvent(CODEX_HOST_TYPES.init, init, { origin: "http://somewhere.example", source: h.parent }),
    );
    assert.equal(h.classes.has("dark"), true);
    client.dispose();
  } finally {
    uninstall();
    console.warn = originalWarn;
  }
});

test("a disposed client can start again (React StrictMode remounts effects)", () => {
  const h = createHarness();
  install(h);
  try {
    const client = createCodexHostClient({ routeDebounceMs: 5 });
    client.start();
    client.dispose();
    assert.equal(h.win.listenerCount(), 0);
    client.start();
    assert.equal(client.active, true);
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.ready).length, 2);
    assert.notEqual(h.win.history.pushState, h.originalPushState);
    client.dispose();
    assert.equal(h.win.history.pushState, h.originalPushState);
  } finally {
    uninstall();
  }
});

test("start() before a DOM exists is retried after mounting", () => {
  uninstall();
  const client = createCodexHostClient();
  client.start();
  assert.equal(client.active, false);

  const h = createHarness();
  install(h);
  try {
    client.start();
    assert.equal(client.active, true);
    assert.equal(messagesOfType(h, CODEX_HOST_TYPES.ready).length, 1);
  } finally {
    client.dispose();
    uninstall();
  }
});

test("without a DOM every entry point is inert and throw-free", () => {
  uninstall();
  const client = createCodexHostClient();
  assert.doesNotThrow(() => {
    client.start();
    client.start();
    client.requestTheme();
    client.notify("info", "hello");
    client.reportError("boom");
    client.dispose();
    client.dispose();
  });
  assert.equal(client.active, false);
  assert.equal(startCodexHostClient().active, false);
});
