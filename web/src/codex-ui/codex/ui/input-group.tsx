import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";
import "./input-group.css";

/**
 * 输入框组合（前缀/后缀 + 输入本体）。
 *
 * ⚠️ **官方无对应组件**；输入容器本体直接复用复制层的 `.cx-input`（官方 _Container_1pj83_2），
 * 前后缀与按钮只做官方 token 的排布（映射见 input-group.css 头注释）。
 * API 与 `@/components/ui/input-group` 一致：
 * `InputGroup / InputGroupAddon / InputGroupButton / InputGroupText / InputGroupInput / InputGroupTextarea`。
 */

export function InputGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-input-group", className)} data-slot="input-group" {...props} />;
}

export interface InputGroupAddonProps extends ComponentProps<"div"> {
  align?: "inline-start" | "inline-end";
}

export function InputGroupAddon({ className, align = "inline-end", ...props }: InputGroupAddonProps) {
  return <div className={cn("cx-input-group__addon", className)} data-align={align} data-slot="input-group-addon" {...props} />;
}

export function InputGroupButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn("cx-input-group__button", className)} size="sm" variant="ghost" {...props} />;
}

export function InputGroupText({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("cx-input-group__text", className)} {...props} />;
}

export function InputGroupInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={className} data-slot="input-group-input" {...props} />;
}

export function InputGroupTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return <Textarea className={className} data-slot="input-group-textarea" {...props} />;
}