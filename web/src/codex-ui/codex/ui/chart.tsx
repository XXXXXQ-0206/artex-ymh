// ⚠️ **唯一一个「不直译」的件**，理由如下：
//   · 官方没有 Chart 组件，也没有 --chart-* token 组（官方只有 --chart-N 颜色阶的语义色名）；
//   · 图表本体是 **recharts**（第三方库）的渲染产物，不属于官方设计语言的「控件」；
//   · shadcn 的 chart.tsx 全是 recharts 的胶水（ResponsiveContainer / Tooltip / Legend 包装）
//     与少量 Tailwind 类，把它逐字复制进复制层只会多一份需要同步的 300 行胶水。
//   因此本文件**只做 re-export**：页面统一从 `@/codex-ui/codex/ui` 取 Chart 族，
//   实现仍是 `@/components/ui/chart`。这一点在 task-12 报告里如实登记为「不承诺 1:1」。
export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
export type { ChartConfig } from "@/components/ui/chart";