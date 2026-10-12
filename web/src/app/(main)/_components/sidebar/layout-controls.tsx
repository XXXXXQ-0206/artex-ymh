"use client";

import type * as React from "react";

import { Settings as SettingsIcon } from "lucide-react";

import { SettingsCard, SettingsRow } from "@/codex-ui/codex/settings/SettingsRow";
import { SettingsButton, SettingsSegmented, SettingsSelect } from "@/codex-ui/codex/settings/controls";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/codex-ui/codex/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/codex-ui/codex/ui";
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
 * 从原 LayoutControls 的 Popover 里抽出来，是因为 2026-10-12 撤掉了 ARTEX 自造的全局页头：
 * 官方这些偏好在**设置页**里（设置 → 个人 → 外观），所以控件搬进设置页的「外观」分区，
 * 逻辑与持久化一个字没改，只是换了个挂载点。Popover 版 LayoutControls 保留给需要的地方。
 *
 * ★ 表现层 = **逐字节移植**的壳组件（web/src/codex-ui/codex/**，见 task-5）：
 *   SettingsRow（壳 src/settings/SettingsRow.tsx）、SettingsSegmented / SettingsSelect /
 *   SettingsButton（壳 src/settings/controls.tsx）、Select / Button / Popover（壳 src/ui/**）、
 *   色板圆点用壳 settings.css 原文的 .cx-settings-swatch__chip。
 *   ★ 本文件不含任何自写样式常量。
 * ⚠️ 返回值必须是 Fragment：行的盒模型来自 .cx-settings-card 的**直接子元素**规则
 *    （分隔线是 .cx-settings-row + .cx-settings-row::before），多包一层 div 就不成立。
 */
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
      {/* 主题预设：选项里带一枚色板圆点（官方 .cx-settings-swatch__chip），所以这一行的
          下拉用壳 ui 的 Select 原语自己拼；触发器样式由壳 settings.css 的
          .cx-settings .cx-select__trigger 提供，不需要额外 class。 */}
      <SettingsRow
        control={
          <Select onValueChange={onThemePresetChange} value={themePreset}>
            <SelectTrigger aria-label="主题预设">
              <SelectValue placeholder="预设" />
            </SelectTrigger>
            <SelectContent>
              {THEME_PRESET_OPTIONS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  <span
                    className="cx-settings-swatch__chip"
                    style={{
                      backgroundColor:
                        (resolvedThemeMode ?? "light") === "dark" ? preset.primary.dark : preset.primary.light,
                    }}
                  />
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        description="界面配色的预设色板。"
        label="主题预设"
      />

      <SettingsRow
        control={
          <SettingsSelect
            label="字体"
            onChange={onFontChange}
            options={fontOptions.map((option) => ({ value: option.key, label: option.label }))}
            value={font}
          />
        }
        description="界面文字所使用的字体族。"
        label="字体"
      />

      <SettingsRow
        control={
          <SettingsSegmented
            label="模式"
            onChange={onThemeModeChange}
            options={[
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
              { value: "system", label: "跟随系统" },
            ]}
            value={themeMode}
          />
        }
        description="浅色 / 深色 / 跟随系统。"
        label="模式"
      />

      <SettingsRow
        control={
          <SettingsSegmented
            label="页面布局"
            onChange={onContentLayoutChange}
            options={[
              { value: "centered", label: "居中" },
              { value: "full-width", label: "全宽" },
            ]}
            value={contentLayout}
          />
        }
        description="主内容居中限宽或铺满整行。"
        label="页面布局"
      />

      <SettingsRow
        control={
          <SettingsSegmented
            label="导航栏行为"
            onChange={onNavbarStyleChange}
            options={[
              { value: "sticky", label: "固定" },
              { value: "scroll", label: "随滚动" },
            ]}
            value={navbarStyle}
          />
        }
        description="顶栏固定在顶部或随内容滚动。"
        label="导航栏行为"
      />

      <SettingsRow
        control={
          <SettingsSegmented
            label="侧边栏样式"
            onChange={onSidebarStyleChange}
            options={[
              { value: "inset", label: "内嵌" },
              { value: "sidebar", label: "并列" },
              { value: "floating", label: "浮动" },
            ]}
            value={variant}
          />
        }
        description="内嵌、并列或浮动面板。"
        label="侧边栏样式"
      />

      <SettingsRow
        control={
          <SettingsSegmented
            label="侧边栏折叠方式"
            onChange={onSidebarCollapseModeChange}
            options={[
              { value: "icon", label: "折叠成图标" },
              { value: "offcanvas", label: "整块收起" },
            ]}
            value={collapsible}
          />
        }
        description="折叠成图标栏或整块收起。"
        label="侧边栏折叠方式"
      />

      <SettingsRow
        control={<SettingsButton onClick={handleRestore}>恢复默认</SettingsButton>}
        description="把上面全部偏好重置为默认值。"
        label="恢复默认外观"
      />
    </>
  );
}

/** Popover 形态：图标按钮 + 同一份外观控件（保留给需要就地调整的地方）。 */
export function LayoutControls() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label="外观设置" size="sm" title="外观设置" uniform variant="soft">
          <SettingsIcon aria-hidden />
        </Button>
      </PopoverTrigger>
      {/* 内容用官方卡片包住（同一份外观控件在设置页里就是卡片内的行）。
          ⚠️ .cx-settings 带 height:100%：必须包在 Radix content **里面**的普通块上
          （对 auto 高的父级按 auto 解析），不能直接挂到 content 本身
          （绝对/固定定位元素的百分比高度会去量外层 popper 包裹块）。 */}
      <PopoverContent align="end">
        <div className="cx-settings">
          <SettingsCard>
            <AppearanceControls />
          </SettingsCard>
        </div>
      </PopoverContent>
    </Popover>
  );
}
