# ARTEX → codex-ui 对话面接入备忘

作者：chat-surface（task-4）。目的：x-chat 的 `web/src/codex-ui/chat/**` 落地后，
把 ARTEX 的对话数据/动作机械地注入官方组件，不再重画样式。

## 1. ARTEX 侧数据源

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 会话列表 | `api.conversations()` → `Conversation[]` | 2s 轮询；`running` 驱动「运行中」态 |
| 历史页 | `api.conversationHistory(id, before, 200)` | `{items: Activity[], cursor, hasMore, running}`，倒序分页（向上滚动加载更早） |
| 增量 | `api.conversationMessages(id, since)` | 轮询游标；`running=false` 时停 |
| 单条正文 | `api.conversationMsgDetail(id, seq)` | 列表里的 `summary` 是截断首行，完整正文要按 seq 拉 |
| 发送 | `api.sendConversationMessage(id, text, attachments)` | 附件走 `api.chatUpload("session", \`conv-\${id}\`, files)` |
| 停止 | `api.stopConversation(id)` | 只中断本次运行 |

## 2. Activity → Codex 消息模型的映射

`Activity.kind`：`user | intent | text | thinking | tool_use | tool_result | result | usage | round | intercept_request`

| Codex 组件 | ARTEX 来源 | 注意 |
| --- | --- | --- |
| 用户气泡 | `kind=user`（`intent` 是 worker 的 LLM 意图，同一形态） | 正文要 `parseUserBody()`：后端在有附件时把 detail 存成 `{text, attachments}` JSON |
| 助手正文 | `kind=text`（流式增量）与 `kind=result`（最终） | 连续 text 合并成一段 markdown；`result` 单独成块 |
| 推理块 | `kind=thinking` | 同一 worker 的连续 thinking 合成一个折叠块 |
| 工具调用块 | `tool_use` + `tool_result` | **按 `tool_use_id` 配对，不能按相邻**（工具可并行）；`is_error` 决定失败色 |
| 轮次分隔 | `kind=round` | `summary` 是标签 |
| 审批卡 | `kind=intercept_request` | 现由 `components/approval-records.tsx` 的 `ApprovalDetail` 渲染；接入时保留该组件 |
| 日期分隔 | 第一条带 `ts` 的 activity | 参考端是「今天 20:07」，13px/500 + 13px/430 |
| 用量 | `kind=usage` / `result` 累加 | 现在放在 52px 标题栏的「…」弹层里，别再加回正文 |

**懒加载**：`summary` 只有截断首行。用户消息与助手正文都用 `useInView`（IntersectionObserver，
root = `[data-slot="scroll-area-viewport"]`，rootMargin 400px）在接近视口时才拉 detail，
否则打开长线程会为每条消息发一次请求。

## 3. 交互/动作清单（接入时不能丢）

- 发送：Enter 发送 / Shift+Enter 换行，由 `useChatSendMode()`（系统设置）决定
- 流式中：发送键 → 停止键；`/btw` 旁路提问走 `useSideQuestions`
- 附件：`+` → 选文件 → 上传 → chip 预览 → 随下条消息发送
- 模型选择：`LLMProfileRow`（Popover 列 `api.llmProfiles()`）
- Todo：`TodoPopover`（取最近一条 `TodoWrite` 的 seq）
- 标题栏：标题 = `conv.title`；右侧「…」= 用量弹层 / 齿轮 → /system/settings/ / 面板键 → 触发外壳 sidebar trigger
- 空态：无消息且非 running 时显示空态文案（不要显示骨架）
- 加载中：`historyLoaded=false` 时用骨架

## 4. 已实测钉死的数值（接入后要复测这几条）

1. 转录列 `[424,·,768]` padding `0 16px 32px`；滚动容器再 `padding-top 32px`；消息 gap **12px**
2. 首页标题块 `[424,327,768,114]` padding `0 20px`；标题 28px/400/33.6px；hero 56×56（其上 24px 间距）
3. 输入面板 `[440,698,736,98]` r22 `rgb(54,54,54)` `inset 0 0 1px rgba(255,255,255,.2)`；工具行 28px、padding `0 8px`、grid 列间距 5px
4. 发送键 28×28 药丸 `rgb(223,223,223)`，图标 `rgb(45,45,45)`，禁用 opacity **0.5**
5. 用户气泡 r22 / padding `10px 16px` / `rgba(223,223,223,.05)`；正文字号 **14px / 22.75px / 430**
6. 「选择项目」条 `710×42 @(453,660)` bg `rgb(40,40,40)`，芯片 `91×28` r9999 padding `0 8px` gap 6px 13px/430/18

## 5. 去重风险

- 会话态顶部 **52px 标题栏**目前由 chat 页面渲染；若 x-shell 在 main 头栏里也做一条，会叠成 104px → 需要二选一。
- 代码块/工具块/推理块的**参考端运行时数值**仍是空白（ref-capture 的会话内容太短没能采到），
  目前只有官方 CSS 原文（snnl5 / 176oq）背书；若 x-chat 重建了这几个组件，以它的官方原文为准。
