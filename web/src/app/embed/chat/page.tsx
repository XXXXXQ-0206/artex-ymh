/**
 * /embed/chat —— 对话面（无外壳版），供 codex 壳层客户端托管。
 *
 * 直接复用 (main)/chat 的实现，避免出现第二份对话界面：外壳由客户端提供，
 * 这里只负责把「内容」原样导出。
 */
export { default } from "@/app/(main)/chat/page";
