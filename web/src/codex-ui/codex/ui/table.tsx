import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./table.css";

/**
 * 表格。
 *
 * ⚠️ **官方无对应组件**：壳 `src/ui/**` 与官方抽取出的 CSS 里都没有数据表格实现
 *   （`ui.css` 全文无 table 规则）。官方**唯一的**表格是 markdown 表格 ——
 *   `web/src/codex-ui/styles/markdown.css` 的 `_TableContainer_176oq_2` / `_Table_176oq_2` /
 *   `_TableScroller_176oq_2` / `_TableStickyHeader_176oq_2` / `_TableHeaderCell_176oq_2` /
 *   `_TableCell_176oq_2` / `_TableRow_176oq_2`（官方原文，逐字 vendored），
 *   另有 composer 内联表格同族 `misc-components.css:270-277`。
 *
 * 本件是那一组的**直译**，token 对应关系与逐条出处写在 `table.css` 头注释里。
 * 交互态用官方通用 token：行 hover = `--color-background-primary-ghost-hover`、
 * 选中 = `--color-background-primary-soft-alpha`（与官方菜单/列表同一族）。
 */

export interface TableProps extends ComponentProps<"table"> {
  /** 表头吸顶（官方 `_TableStickyHeader_176oq_2`：背景 `--color-surface` + sticky top 0） */
  stickyHeader?: boolean;
}

export function Table({ className, stickyHeader, ...props }: TableProps) {
  return (
    <div className="cx-table-container" data-slot="table-container">
      <table
        className={cn("cx-table", className)}
        data-slot="table"
        data-sticky-header={stickyHeader ? "true" : undefined}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("cx-table__head", className)} data-slot="table-header" {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("cx-table__body", className)} data-slot="table-body" {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot className={cn("cx-table__footer", className)} data-slot="table-footer" {...props} />;
}

export interface TableRowProps extends ComponentProps<"tr"> {
  /** 可悬停的高亮行（官方通用 hover 底，非本件自创视觉） */
  interactive?: boolean;
  /** 选中行底（官方 `--color-background-primary-soft-alpha`） */
  selected?: boolean;
}

export function TableRow({ className, interactive, selected, ...props }: TableRowProps) {
  return (
    <tr
      className={cn("cx-table__row", className)}
      data-interactive={interactive ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-slot="table-row"
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("cx-table__header-cell", className)} data-slot="table-head" {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("cx-table__cell", className)} data-slot="table-cell" {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("cx-table__caption", className)} data-slot="table-caption" {...props} />;
}