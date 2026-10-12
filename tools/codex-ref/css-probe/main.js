// Reports CSS feature support of the exact Electron/Chromium that ships in desktop/build.
// Run:  <repo>\desktop\node_modules\electron\dist\electron.exe tools\codex-ref\css-probe
// Prints one line starting with CSSPROBE then exits. No window is shown, no user data is written
// outside the app's own temp profile, and the real ARTEX app is never started.
const { app, BrowserWindow } = require('electron');

const EXPR = [
  'JSON.stringify({',
  "  userAgent: navigator.userAgent,",
  "  chromeVersion: (navigator.userAgent.match(/Chrome\\/([0-9.]+)/) || [])[1] || null,",
  "  cornerShapeSuperellipse: CSS.supports('corner-shape', 'superellipse(1.5)'),",
  "  cornerShapeRound: CSS.supports('corner-shape', 'round'),",
  "  cornerShapeSquircle: CSS.supports('corner-shape', 'squircle'),",
  "  cornerShapeSingleArg: CSS.supports('corner-shape: superellipse(1.5)'),",
  "  colorMixOklab: CSS.supports('color', 'color-mix(in oklab, red 50%, transparent)'),",
  "  rgbFrom: CSS.supports('color', 'rgb(from red r g b / 1)'),",
  "  containerQueries: CSS.supports('container-type', 'size'),",
  "  fieldSizing: CSS.supports('field-sizing', 'content'),",
  "  anchorPositioning: CSS.supports('anchor-name', '--x'),",
  "  backdropFilter: CSS.supports('backdrop-filter', 'blur(16px)'),",
  "  scrollbarWidth: CSS.supports('scrollbar-width', 'thin'),",
  "  textWrapBalance: CSS.supports('text-wrap', 'balance'),",
  "  interpolateSize: CSS.supports('interpolate-size', 'allow-keywords'),",
  "  viewTransition: typeof document.startViewTransition === 'function',",
  "  popover: HTMLElement.prototype.hasOwnProperty('popover'),",
  "  selectedcontent: CSS.supports('selector(:has(*))'),",
  "  accentColor: CSS.supports('accent-color', 'auto'),",
  "  lightDark: CSS.supports('color-scheme', 'light dark')",
  '})',
].join('\n');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 320, height: 240 });
  try {
    await win.loadURL('data:text/html,<html><body style="margin:0">probe</body></html>');
    const res = await win.webContents.executeJavaScript(EXPR);
    console.log('CSSPROBE ' + res);
    app.exit(0);
  } catch (err) {
    console.log('CSSPROBE_ERROR ' + (err && err.stack ? err.stack : String(err)));
    app.exit(1);
  }
});