(() => {
  const names = __NAMES__;
  const expected = __EXPECTED__;
  const probe = document.createElement('div');
  probe.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:0;height:0;visibility:hidden');
  document.body.appendChild(probe);
  // 用 canvas.fillStyle 强制把任意 CSS 颜色转成 sRGB 表示。
  // 只用 getComputedStyle 不行：Chromium 会把 lab()/color() 原样返回，两个引擎序列化不同。
  const cctx = document.createElement('canvas').getContext('2d');
  const tryColor = (s) => {
    try { cctx.fillStyle = '#000000'; cctx.fillStyle = s; const f = cctx.fillStyle; if (f && f !== '#000000') return f; } catch (e) {}
    probe.style.color = 'rgb(1, 2, 3)'; probe.style.color = s;
    const c = getComputedStyle(probe).color;
    return c === 'rgb(1, 2, 3)' ? null : c;
  };
  const tryLength = (s) => { probe.style.width = '1px'; probe.style.width = s; const w = getComputedStyle(probe).width; return w === '1px' ? null : w; };
  const canon = (v) => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const c = tryColor(s); if (c) return 'C|' + c;
    const l = tryLength(s); if (l) return 'L|' + l;
    return 'S|' + s.toLowerCase().replace(/\s+/g, '').replace(/(^|[(,])0\./g, '$1.').replace(/;$/, '');
  };
  const st = getComputedStyle(document.documentElement);
  const out = [];
  for (const n of names) {
    const actual = st.getPropertyValue(n).trim();
    const exp = expected[n];
    const ce = canon(exp), ca = canon(actual);
    out.push({ token: n, expected: exp, actual: actual, canonExpected: ce, canonActual: ca, ok: ce === ca });
  }
  probe.remove();
  return JSON.stringify(out);
})()