import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";
import "./native-select.css";

/**
 * 原生下拉。
 *
 * ⚠️ **官方无对应组件**；尺寸/圆角/内距/描边直接复用复制层 `.cx-input`
 * （官方 `_Container_1pj83_2` 的那套 `--input-*`），箭头走官方图标尺寸 token。
 * API 与 `@/components/ui/native-select` 一致：
 * `NativeSelect / NativeSelectOption / NativeSelectOptGroup`。
 */

export interface NativeSelectProps extends Omit<ComponentProps<"select">, "size"> {
  size?: "3xs" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
}

export function NativeSelect({ className, size = "sm", children, ...props }: NativeSelectProps) {
  return (
    <span className={cn("cx-input", "cx-native-select", className)} data-size={size} data-slot="native-select-wrapper">
      <select className="cx-input__control" data-slot="native-select" {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="cx-native-select__icon" />
    </span>
  );
}

export function NativeSelectOption({ className, ...props }: ComponentProps<"option">) {
  return <option className={cn(className)} data-slot="native-select-option" {...props} />;
}

export function NativeSelectOptGroup({ className, ...props }: ComponentProps<"optgroup">) {
  return <optgroup className={cn(className)} data-slot="native-select-optgroup" {...props} />;
}