/**
 * 基础件（ui）—— 设置页与全应用共用的原子组件。
 *
 * 设计与数值契约见 ui.css 头注释：全部走官方 token，状态用 data-* 属性表达，
 * 每个交互件都有 hover / active / focus-visible / disabled 与 reduced-motion 分支。
 */
export * from "./alert-dialog";
// [控制台逐字节移植] 以下 1 行为控制台新增：官方无 Badge 组件（壳 src/ui/** 无此件、
// ui.css 全文无 badge 规则），按官方 --badge-* token 组补齐，见 badge.tsx 头注释。
// 除本行外，本文件与壳 src/ui/index.ts 逐字节相同（另有 controls-gallery 一行按范围删除）。
export * from "./badge";
export * from "./button";
// [控制台新增] 官方无 card / tabs 组件，按官方 token 组直译补齐，见各自文件头注释。
export * from "./card";
export * from "./checkbox";
export * from "./context-menu";
// [控制台逐字节移植] 此处原为 export * from "./controls-gallery"；
// controls-gallery 是 dev 画廊页（/controls），按移植范围排除，故本行删除。
// 除本行外，本文件与壳 src/ui/index.ts 逐字节相同。
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./hover-card";
export * from "./input";
export * from "./kbd";
export * from "./label";
export * from "./menubar";
export * from "./model-picker";
export * from "./permission-menu";
export * from "./popover";
export * from "./radio-group";
export * from "./scroll-area";
export * from "./select";
export * from "./separator";
// [控制台新增] 官方无 sheet / table 组件（壳 src/ui/** 无此件、ui.css 全文无对应规则），
// 按官方 vendored CSS 直译补齐，出处见 sheet.tsx / table.tsx 头注释。
export * from "./sheet";
export * from "./table";
export * from "./skeleton";
export * from "./slider";
export * from "./switch";
// [控制台新增] 官方无 tabs 组件，按官方 --segmented-control-* token 组直译，见 tabs.tsx 头注释。
export * from "./tabs";
export * from "./textarea";
export * from "./toast";
export * from "./tooltip";
