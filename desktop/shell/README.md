# public/ · 官方静态资源

> 全部文件**逐字节复制**自 Codex Desktop 发行产物，未做任何重绘、缩放或再压缩。
> 只放「可独立使用」的位图/矢量；渲染层的图标是 React 组件，见 [`src/icons/`](../src/icons/) 与 [`docs/ICONS.md`](../docs/ICONS.md)。

## 0. 汇总

| 目录 | 文件数 | 总字节 | 来源（只读，未修改） |
| --- | --: | --: | --- |
| `public/app-icons/` | 29 | 275271 | `N:/app/webview/apps/*` |
| `public/app-logo/` | 38 | 95100 | `N:/docs/msix/assets/*` |

（`N` = `C:\Users\熊骞\Documents\Codex\2026-10-09\codex-desktop-unpack\outputs\codex-desktop-electron`）

## 1. `public/app-icons/` —— 终端 / 编辑器应用图标（29 个）

渲染层用它给「在哪个应用里打开这个项目」这类选择器画图标。文件名即官方应用标识符。

| 文件 | 尺寸 | 字节 |
| --- | --- | --: |
| `android-studio.png` | 64×64 | 3211 |
| `antigravity.png` | 64×64 | 3016 |
| `bbedit.png` | 128×128 | 17649 |
| `cmder.png` | 256×256 | 3455 |
| `cursor.png` | 64×64 | 2478 |
| `devin.svg` | 386×386 | 4573 |
| `emacs.png` | 128×128 | 13462 |
| `file-explorer.png` | 64×64 | 2638 |
| `finder.png` | 64×64 | 3893 |
| `ghostty.png` | 64×64 | 5623 |
| `goland.png` | 256×256 | 22131 |
| `intellij.png` | 64×64 | 3374 |
| `iterm2.png` | 64×64 | 2715 |
| `kitty.png` | 64×64 | 4830 |
| `microsoft-terminal.png` | 32×32 | 403 |
| `phpstorm.png` | 256×256 | 20832 |
| `pycharm.png` | 64×64 | 3351 |
| `rider.png` | 256×256 | 23278 |
| `rustrover.png` | 256×256 | 10118 |
| `sublime-text.png` | 64×64 | 3795 |
| `terminal.png` | 64×64 | 2623 |
| `textmate.png` | 256×256 | 92692 |
| `vscode-insiders.png` | 64×64 | 2726 |
| `vscode.png` | 64×64 | 2804 |
| `warp.png` | 64×64 | 4792 |
| `webstorm.svg` | 64×64 | 2775 |
| `windsurf.png` | 64×64 | 2645 |
| `xcode.png` | 64×64 | 4600 |
| `zed.png` | 64×64 | 4789 |

## 2. `public/app-logo/` —— 应用图标 / 徽标 / 启动图（38 个）

来自 MSIX 包清单的资产目录，文件名保留官方命名（含 `targetsize-*` / `altform-unplated` / `scale-200` 限定符）。
含义：`Square44x44Logo.targetsize-NN` = 任务栏/开始菜单在 NN 逻辑像素下的图标；`altform-unplated` = 无底板版（Windows 11 用）；
`altform-lightunplated` = 浅色主题的无底板版；`scale-200` = 200% DPI 版。

| 文件 | 尺寸 | 字节 |
| --- | --- | --: |
| `LockScreenLogo.scale-200.png` | 48×48 | 1566 |
| `SplashScreen.scale-200.png` | 1240×600 | 13436 |
| `Square150x150Logo.png` | 300×300 | 4020 |
| `Square150x150Logo.scale-200.png` | 300×300 | 4020 |
| `Square44x44Logo.png` | 88×88 | 2877 |
| `Square44x44Logo.scale-200.png` | 88×88 | 2877 |
| `Square44x44Logo.targetsize-16_altform-lightunplated.png` | 16×16 | 461 |
| `Square44x44Logo.targetsize-16_altform-unplated.png` | 16×16 | 468 |
| `Square44x44Logo.targetsize-20_altform-lightunplated.png` | 20×20 | 603 |
| `Square44x44Logo.targetsize-20_altform-unplated.png` | 20×20 | 626 |
| `Square44x44Logo.targetsize-24_altform-lightunplated.png` | 24×24 | 748 |
| `Square44x44Logo.targetsize-24_altform-unplated.png` | 24×24 | 762 |
| `Square44x44Logo.targetsize-256_altform-lightunplated.png` | 256×256 | 8932 |
| `Square44x44Logo.targetsize-256_altform-unplated.png` | 256×256 | 9264 |
| `Square44x44Logo.targetsize-30_altform-lightunplated.png` | 30×30 | 940 |
| `Square44x44Logo.targetsize-30_altform-unplated.png` | 30×30 | 958 |
| `Square44x44Logo.targetsize-32_altform-lightunplated.png` | 32×32 | 999 |
| `Square44x44Logo.targetsize-32_altform-unplated.png` | 32×32 | 1042 |
| `Square44x44Logo.targetsize-36_altform-lightunplated.png` | 36×36 | 1171 |
| `Square44x44Logo.targetsize-36_altform-unplated.png` | 36×36 | 1201 |
| `Square44x44Logo.targetsize-40_altform-lightunplated.png` | 40×40 | 1318 |
| `Square44x44Logo.targetsize-40_altform-unplated.png` | 40×40 | 1343 |
| `Square44x44Logo.targetsize-44_altform-lightunplated.png` | 44×44 | 1397 |
| `Square44x44Logo.targetsize-44_altform-unplated.png` | 44×44 | 1431 |
| `Square44x44Logo.targetsize-48_altform-lightunplated.png` | 48×48 | 1537 |
| `Square44x44Logo.targetsize-48_altform-unplated.png` | 48×48 | 1566 |
| `Square44x44Logo.targetsize-60_altform-lightunplated.png` | 60×60 | 1887 |
| `Square44x44Logo.targetsize-60_altform-unplated.png` | 60×60 | 1936 |
| `Square44x44Logo.targetsize-64_altform-lightunplated.png` | 64×64 | 2016 |
| `Square44x44Logo.targetsize-64_altform-unplated.png` | 64×64 | 2103 |
| `Square44x44Logo.targetsize-72_altform-lightunplated.png` | 72×72 | 2299 |
| `Square44x44Logo.targetsize-72_altform-unplated.png` | 72×72 | 2368 |
| `Square44x44Logo.targetsize-80_altform-lightunplated.png` | 80×80 | 2543 |
| `Square44x44Logo.targetsize-80_altform-unplated.png` | 80×80 | 2618 |
| `Square44x44Logo.targetsize-96_altform-lightunplated.png` | 96×96 | 3111 |
| `Square44x44Logo.targetsize-96_altform-unplated.png` | 96×96 | 3208 |
| `Wide310x150Logo.scale-200.png` | 620×300 | 4561 |
| `icon.png` | 50×50 | 887 |

## 3. 用法

`public/` 下的文件按原路径出现在站点根，Vite 原样拷贝进 `dist/`，**不要 import**（会被打包器再处理一遍）：

```tsx
// 正确：直接给绝对路径
<img src="/app-icons/vscode.png" alt="" width={16} height={16} />
// 错误：import icon from "@/../public/app-icons/vscode.png"  ← 会走打包管线
```

## 4. 复算

```powershell
$N = 'C:\Users\熊骞\Documents\Codex\2026-10-09\codex-desktop-unpack\outputs\codex-desktop-electron'
Get-ChildItem $N\app\webview\apps -File | Get-FileHash -Algorithm SHA256
Get-ChildItem $N\docs\msix\assets -File | Get-FileHash -Algorithm SHA256
# 与本目录同名文件比对即可确认逐字节一致
```
