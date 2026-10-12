import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { Label } from "./label";
import { Separator } from "./separator";
import "./field.css";

/**
 * 表单字段族。
 *
 * ⚠️ **官方无对应组件**（官方唯一带 token 组的表单件是 label）。
 * 本件按官方 token 直译，逐条映射见 `field.css` 头注释；API 与 `@/components/ui/field` 一致：
 * `FieldSet / FieldLegend / FieldGroup / Field / FieldLabel / FieldTitle / FieldDescription / FieldContent / FieldSeparator`。
 */

export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return <fieldset className={cn("cx-field-set", className)} data-slot="field-set" {...props} />;
}

export interface FieldLegendProps extends ComponentProps<"legend"> {
  /** 与 shadcn 同名档：legend（默认，中号）/ label（小号） */
  variant?: "legend" | "label";
}

export function FieldLegend({ className, variant = "legend", ...props }: FieldLegendProps) {
  return (
    <legend className={cn("cx-field-legend", className)} data-slot="field-legend" data-variant={variant} {...props} />
  );
}

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-field-group", className)} data-slot="field-group" {...props} />;
}

export interface FieldProps extends ComponentProps<"div"> {
  orientation?: "vertical" | "horizontal";
  /** 便捷式：直接给标签文本（等价于内部渲染一个 FieldLabel） */
  label?: string;
  htmlFor?: string;
  description?: string;
}

export function Field({ className, orientation = "vertical", label, htmlFor, description, children, ...props }: FieldProps) {
  return (
    <div
      className={cn("cx-field", className)}
      data-orientation={orientation}
      data-slot="field"
      role="group"
      {...props}
    >
      {label ? <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel> : null}
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </div>
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label className={cn("cx-field-label", className)} data-slot="field-label" {...props} />;
}

export function FieldTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-field-label", className)} data-slot="field-title" {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("cx-field-description", className)} data-slot="field-description" {...props} />;
}

export function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-field-content", className)} data-slot="field-content" {...props} />;
}

export function FieldSeparator({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("cx-field-separator", className)} data-slot="field-separator" {...props}>
      <Separator />
      {children}
    </div>
  );
}