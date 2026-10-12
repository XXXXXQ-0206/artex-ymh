"use client";

import type * as React from "react";

import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type FontKey, fontOptions } from "@/lib/fonts/registry";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@/lib/preferences/layout-utils";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { applyThemePreset } from "@/lib/preferences/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * 外观控件本体（主题模式/预设、字体、页面布局、导航栏行为、侧边栏样式与折叠方式、恢复默认）。
 *
 * 从原 `LayoutControls` 的 Popover 里抽出来，是因为 2026-10-12 撤掉了 ARTEX 自造的全局页头：
 * 官方这些偏好在**设置页**里（设置 → 个人 → 外观），所以控件搬进设置页的「外观」卡片，
 * 逻辑与持久化一个字没改，只是换了个挂载点。Popover 版 `LayoutControls` 保留给需要的地方。
 */
/**
 * 官方设置行范式：**左「标签 + 说明」/ 右「控件」**。
 *
 * 官方实测（1280×816，codex-1to1-settings.png）：行 min-height 64、padding-block 12、左右 gap 24、
 * 行间分隔线 1px 白 8%（末行无）；标签 13/500/18.57，说明 12/430/16 且用次级色。
 * 行盒模型由 codex-settings.css 的 `[data-slot="card-content"] > div.flex` 规则提供，
 * 所以这里的根节点**必须**是 `div.flex`，而且因为读取的是直接子选择器（`>`），
 * AppearanceControls 必须用 Fragment 返回（Fragment 不产生 DOM），行才落成 CardContent 的直接子节点。
 */
function AppearanceRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="block text-[13px] font-medium leading-[18.57px]">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-[12px] font-[430] leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
export function AppearanceControls() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout);
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle);
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle);
  const variant = usePreferencesStore((s) => s.sidebarVariant);
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant);
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible);
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible);
  const font = usePreferencesStore((s) => s.font);
  const setFont = usePreferencesStore((s) => s.setFont);

  const onThemePresetChange = (preset: ThemePreset) => {
    applyThemePreset(preset);
    setThemePreset(preset);
    void persistPreference("theme_preset", preset);
  };

  const onThemeModeChange = (mode: ThemeMode | "") => {
    if (!mode) return;
    setThemeMode(mode);
    void persistPreference("theme_mode", mode);
  };

  const onContentLayoutChange = (layout: ContentLayout | "") => {
    if (!layout) return;
    applyContentLayout(layout);
    setContentLayout(layout);
    void persistPreference("content_layout", layout);
  };

  const onNavbarStyleChange = (style: NavbarStyle | "") => {
    if (!style) return;
    applyNavbarStyle(style);
    setNavbarStyle(style);
    void persistPreference("navbar_style", style);
  };

  const onSidebarStyleChange = (value: SidebarVariant | "") => {
    if (!value) return;
    setSidebarVariant(value);
    applySidebarVariant(value);
    void persistPreference("sidebar_variant", value);
  };

  const onSidebarCollapseModeChange = (value: SidebarCollapsible | "") => {
    if (!value) return;
    setSidebarCollapsible(value);
    applySidebarCollapsible(value);
    void persistPreference("sidebar_collapsible", value);
  };

  const onFontChange = (value: FontKey | "") => {
    if (!value) return;
    applyFont(value);
    setFont(value);
    void persistPreference("font", value);
  };

  const handleRestore = () => {
    onThemePresetChange(PREFERENCE_DEFAULTS.theme_preset);
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode);
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout);
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style);
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant);
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible);
    onFontChange(PREFERENCE_DEFAULTS.font);
  };

  return (
    <>
      <AppearanceRow label="主题预设" htmlFor="appearance-preset" description="界面配色的预设色板。">
        <Select value={themePreset} onValueChange={onThemePresetChange}>
          <SelectTrigger id="appearance-preset" size="sm" className="w-[180px] text-xs">
            <SelectValue placeholder="预设" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {THEME_PRESET_OPTIONS.map((preset) => (
                <SelectItem key={preset.value} className="text-xs" value={preset.value}>
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        (resolvedThemeMode ?? "light") === "dark" ? preset.primary.dark : preset.primary.light,
                    }}
                  />
                  {preset.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </AppearanceRow>

      <AppearanceRow label="字体" htmlFor="appearance-font" description="界面文字所使用的字体族。">
        <Select value={font} onValueChange={onFontChange}>
          <SelectTrigger id="appearance-font" size="sm" className="w-[180px] text-xs">
            <SelectValue placeholder="选择字体" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {fontOptions.map((fontOption) => (
                <SelectItem key={fontOption.key} className="text-xs" value={fontOption.key}>
                  {fontOption.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </AppearanceRow>

      <AppearanceRow label="模式" description="浅色 / 深色 / 跟随系统。">
        <ToggleGroup
          size="sm"
          spacing={0}
          variant="outline"
          type="single"
          value={themeMode}
          onValueChange={onThemeModeChange}
          className="w-[248px] **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs"
        >
          <ToggleGroupItem value="light" aria-label="浅色">
            浅色
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="深色">
            深色
          </ToggleGroupItem>
          <ToggleGroupItem value="system" aria-label="跟随系统">
            跟随系统
          </ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>

      <AppearanceRow label="页面布局" description="主内容居中限宽或铺满整行。">
        <ToggleGroup
          size="sm"
          spacing={0}
          variant="outline"
          type="single"
          value={contentLayout}
          onValueChange={onContentLayoutChange}
          className="w-[180px] **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs"
        >
          <ToggleGroupItem value="centered" aria-label="内容居中">
            居中
          </ToggleGroupItem>
          <ToggleGroupItem value="full-width" aria-label="内容全宽">
            全宽
          </ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>

      <AppearanceRow label="导航栏行为" description="顶栏固定在顶部或随内容滚动。">
        <ToggleGroup
          size="sm"
          spacing={0}
          variant="outline"
          type="single"
          value={navbarStyle}
          onValueChange={onNavbarStyleChange}
          className="w-[180px] **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs"
        >
          <ToggleGroupItem value="sticky" aria-label="固定">
            固定
          </ToggleGroupItem>
          <ToggleGroupItem value="scroll" aria-label="随滚动">
            随滚动
          </ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>

      <AppearanceRow label="侧边栏样式" description="内嵌、并列或浮动面板。">
        <ToggleGroup
          size="sm"
          spacing={0}
          variant="outline"
          type="single"
          value={variant}
          onValueChange={onSidebarStyleChange}
          className="w-[248px] **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs"
        >
          <ToggleGroupItem value="inset" aria-label="内嵌">
            内嵌
          </ToggleGroupItem>
          <ToggleGroupItem value="sidebar" aria-label="并列">
            并列
          </ToggleGroupItem>
          <ToggleGroupItem value="floating" aria-label="浮动">
            浮动
          </ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>

      <AppearanceRow label="侧边栏折叠方式" description="折叠成图标栏或整块收起。">
        <ToggleGroup
          size="sm"
          spacing={0}
          variant="outline"
          type="single"
          value={collapsible}
          onValueChange={onSidebarCollapseModeChange}
          className="w-[180px] **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs"
        >
          <ToggleGroupItem value="icon" aria-label="折叠成图标">
            折叠成图标
          </ToggleGroupItem>
          <ToggleGroupItem value="offcanvas" aria-label="整块收起">
            整块收起
          </ToggleGroupItem>
        </ToggleGroup>
      </AppearanceRow>

      <AppearanceRow label="恢复默认外观" description="把上面全部偏好重置为默认值。">
        <Button type="button" size="sm" variant="outline" className="text-xs" onClick={handleRestore}>
          恢复默认
        </Button>
      </AppearanceRow>
    </>
  );
}

/** Popover 形态：图标按钮 + 同一份外观控件（保留给需要就地调整的地方）。 */
export function LayoutControls() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" aria-label="外观设置" title="外观设置">
          <Settings />
        </Button>
      </PopoverTrigger>
      {/* 行式范式是给设置页卡片设计的（行的盒模型来自 codex-settings.css 的 card-content 直接子规则）；
          Popover 里没有那套规则，所以自己补竖向间距，并把宽度放到能容纳「左标签 + 右控件」的 24rem。 */}
      <PopoverContent align="end" className="w-96">
        <div className="flex flex-col gap-4">
          <AppearanceControls />
        </div>
      </PopoverContent>
    </Popover>
  );
}
