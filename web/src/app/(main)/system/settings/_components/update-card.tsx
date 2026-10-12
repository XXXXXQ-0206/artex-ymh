"use client";

import * as React from "react";

import { toast } from "sonner";

import { SettingsCard, SettingsCardBody, SettingsRow } from "@/codex-ui/codex/settings/SettingsRow";
import { SettingsButton, SettingsValueText } from "@/codex-ui/codex/settings/controls";
import { Button } from "@/codex-ui/codex/ui";
import { api, sseUrl } from "@/lib/api";
import { safeHref } from "@/lib/safe-href";
import type { UpdateCheck, UpdateProgress } from "@/lib/types";

/** 等待新版本上线的最长时间。一次升级要经过三次进程启动（暂存 → 换装 → 新版），
 *  每次都是秒级，三分钟足够覆盖慢磁盘和 Docker 容器重建。 */
const RESTART_TIMEOUT_MS = 180_000;

function humanSize(n?: number): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 版本与更新（设置 → 版本与更新）。
 *
 * ★ 表现层 = **逐字节移植**的壳组件（web/src/codex-ui/codex/**，见 task-5）：
 *   SettingsCard / SettingsCardBody / SettingsRow（壳 src/settings/SettingsRow.tsx）
 *   SettingsButton / SettingsValueText（壳 src/settings/controls.tsx）
 *   Button（壳 src/ui/**，实心档）；文本类 cx-settings-note / cx-settings-field__error / __warn
 *   来自壳 settings.css 原文。
 *   ★ 已删除原先的红框/琥珀框告警条、三个 chip 徽章、图标药丸按钮与自写进度条 ——
 *     官方设置面没有这些件，现按「行 + 官方控件 / 官方文本」表达。
 * 逻辑（hooks / SSE / 轮询 / confirm / toast）与旧实现一字不差。
 */
export function UpdateCard() {
  const [info, setInfo] = React.useState<UpdateCheck | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [progress, setProgress] = React.useState<UpdateProgress | null>(null);
  // 与 progress 分开：暂存完成后进程就没了，SSE 会断，此时要切到轮询 /api/health。
  const [restarting, setRestarting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // quiet 同时决定要不要绕过后端缓存：进页面时的自动检查用缓存（顶栏刚查过），
  // 用户手动点「检查更新」则强制回源，否则刚发布的版本要等缓存过期才看得到。
  const check = React.useCallback((quiet = false) => {
    setChecking(true);
    api
      .checkUpdate(!quiet)
      .then((r) => {
        setInfo(r);
        if (!quiet) {
          if (r.error) toast.error("检查更新失败：" + r.error);
          else if (r.has_update) toast.success("发现新版本 " + r.latest);
          else if (r.comparable) toast.success("当前已是最新版本");
        }
      })
      .catch((e) => {
        if (!quiet) toast.error("检查更新失败：" + (e as Error).message);
      })
      .finally(() => setChecking(false));
  }, []);

  React.useEffect(() => {
    check(true);
  }, [check]);

  // 轮询 /api/health 直到版本号变化。
  //
  // 判据必须是"版本变了"而不是"能连上了"：换装过程中旧版本会短暂地重新起来一次
  // （那一次只负责把 artex.new 换上去然后立刻退出），只看连通性会误判成功。
  const waitForNewVersion = React.useCallback(async (fromVersion: string) => {
    setRestarting(true);
    const deadline = Date.now() + RESTART_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(2000);
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { version?: string };
          if (j.version && j.version !== fromVersion) {
            toast.success("已更新到 " + j.version + "，正在重新加载页面");
            await sleep(800);
            window.location.reload();
            return;
          }
        }
      } catch {
        // 重启窗口内连不上是预期的，继续轮询。
      }
    }
    setRestarting(false);
    toast.error("等待服务重启超时。请检查后端日志，或确认 artex 是通过 start.sh / start.bat 启动的。");
  }, []);

  // 订阅更新进度。SSE 不走 Next 的 /api 重写（那层会缓冲，事件推不出来）。
  // F6:凭据是 60s 一次性 ticket;更新过程后端会重启,不重连(交给 /api/health 轮询)。
  const openStream = React.useCallback(
    async (fromVersion: string) => {
      const es = new EventSource(await sseUrl("/api/update/stream"));
      es.onmessage = (ev) => {
        let p: UpdateProgress;
        try {
          p = JSON.parse(ev.data) as UpdateProgress;
        } catch {
          return;
        }
        setProgress(p);
        if (p.phase === "failed") {
          es.close();
          setBusy(false);
          toast.error("更新失败：" + (p.error || p.message));
          return;
        }
        if (p.phase === "staged") {
          es.close();
          void waitForNewVersion(fromVersion);
        }
      };
      es.onerror = () => {
        // 进程退出时 SSE 必然断开。如果已经进入等待重启，这属于正常现象，
        // 交给 /api/health 轮询继续判定即可。
        es.close();
      };
      return es;
    },
    [waitForNewVersion],
  );

  const doUpdate = () => {
    if (!info) return;
    const from = info.current;
    const ok = window.confirm(
      "确定更新到 " +
        info.latest +
        "？\n\n" +
        "更新会重启程序，正在运行的任务会被中断。\n" +
        (info.mode === "docker"
          ? "\n注意：容器内更新只替换程序本身，不会更新镜像里的 playwright / nmap 等工具链；" +
            "若新版本依赖新工具，请改用 docker compose pull。"
          : ""),
    );
    if (!ok) return;

    setBusy(true);
    setProgress({ phase: "downloading", percent: 0, message: "准备中…" });
    void (async () => {
      let es: EventSource;
      try {
        es = await openStream(from);
      } catch (e) {
        setBusy(false);
        setProgress(null);
        toast.error("打开更新进度流失败：" + (e as Error).message);
        return;
      }
      api.applyUpdate().catch((e) => {
        es.close();
        setBusy(false);
        setProgress(null);
        toast.error("启动更新失败：" + (e as Error).message);
      });
    })();
  };

  const doRollback = () => {
    if (!info) return;
    if (
      !window.confirm(
        "回滚到上一版本？\n\n程序会重启，正在运行的任务会被中断。\n注意：数据库结构不会回退，旧版本可能无法识别新版写入的数据。",
      )
    )
      return;
    const from = info.current;
    setBusy(true);
    api
      .rollbackUpdate()
      .then(() => {
        toast.success("已切换到上一版本，正在重启…");
        void waitForNewVersion(from);
      })
      .catch((e) => {
        setBusy(false);
        toast.error("回滚失败：" + (e as Error).message);
      });
  };

  const phase = progress?.phase;
  const showProgress = busy || restarting;
  // 只有下载阶段拿得到真实百分比（按 Content-Length 算）。校验/解压/等待重启都是
  // 时长不可知的阶段，进度显示 100% 并配「进行中」文案。
  const downloading = !restarting && phase === "downloading";
  const pct = downloading ? Math.max(progress?.percent ?? 0, 0) : 100;
  // html_url 来自 GitHub API 响应,只允许 http(s) 进 href;异常值时不渲染链接。
  const changelogHref = safeHref(info?.html_url);

  // 「最新版本」行的说明：把旧实现那一串 chip/告警条压成一句官方文本。
  const latestDescription = info?.error
    ? "无法连接 GitHub：" + info.error
    : info && !info.comparable
      ? (info.reason ?? "无法比较版本")
      : info?.has_update
        ? "发现新版本，可一键更新。"
        : "当前已是最新版本。";

  return (
    <SettingsCard>
      <SettingsRow
        control={
          <>
            <SettingsValueText value={info?.current ?? "…"} />
            <SettingsButton disabled={checking || busy || restarting} onClick={() => check(false)}>
              {checking ? "检查中…" : "检查更新"}
            </SettingsButton>
          </>
        }
        description={
          info ? info.os + "/" + info.arch + " · " + (info.mode === "docker" ? "Docker" : "独立程序") : "正在读取…"
        }
        label="当前版本"
      />

      {info?.latest && (
        <SettingsRow
          control={<SettingsValueText value={info.latest} />}
          description={
            <>
              {latestDescription}
              {changelogHref ? (
                <>
                  {" "}
                  <a className="cx-settings-link" href={changelogHref} rel="noreferrer" target="_blank">
                    更新日志
                  </a>
                </>
              ) : null}
            </>
          }
          label="最新版本"
        />
      )}

      <SettingsRow
        control={
          <>
            <Button
              disabled={busy || restarting || !info?.has_update || info?.asset_available === false}
              onClick={doUpdate}
              size="sm"
              variant="solid"
            >
              {info?.has_update ? "更新到 " + info.latest : "立即更新"}
            </Button>
            {info?.has_backup && (
              <SettingsButton disabled={busy || restarting} onClick={doRollback}>
                回滚到上一版本
              </SettingsButton>
            )}
          </>
        }
        description="从 GitHub 检查并安装新版本。更新会重启程序，正在运行的任务会被中断；下载后校验 SHA256 并冒烟测试，失败自动保留当前版本。"
        label="安装更新"
      />

      {showProgress && (
        <SettingsRow
          control={<SettingsValueText value={pct + "%"} />}
          description={restarting ? "正在重启并应用新版本，请稍候（页面会自动刷新）…" : progress?.message}
          label="更新进度"
        />
      )}

      {(info?.boot_notice ||
        (info?.error && info && !info.comparable) ||
        (info?.has_update && info.asset_available === false) ||
        (info?.mode === "docker" && info.has_update)) && (
        <SettingsCardBody>
          {info?.boot_notice && <p className="cx-settings-field__warn">{info.boot_notice}</p>}

          {info?.error && (
            <p className="cx-settings-field__error">
              无法连接 GitHub：{info.error}
              {"　"}可在上方配置全局代理后重试。
            </p>
          )}

          {info?.has_update && info.asset_available === false && (
            <p className="cx-settings-field__error">
              {info.latest} 没有提供 {info.os}/{info.arch} 的发布包（缺少 {info.asset}），无法自动更新。
            </p>
          )}

          {info?.mode === "docker" && info.has_update && (
            <p className="cx-settings-note">
              Docker 下的更新只替换程序本身，不更新镜像里的 playwright / nmap 等工具链，且 docker compose up -d
              重建容器后会退回镜像自带的版本。需要连镜像一起升级请执行：docker compose pull artex &amp;&amp; docker
              compose up -d artex。
            </p>
          )}
        </SettingsCardBody>
      )}

      <SettingsCardBody>
        <p className="cx-settings-note">
          一键更新依赖守护脚本重启程序。请通过 start.sh（Windows 为 start.bat）启动 ARTEX；直接运行 artex
          本体时，程序退出后不会被自动拉起。
        </p>
        <p className="cx-settings-note">
          发布包：{info?.asset ?? "—"}
          {info?.size ? "（" + humanSize(info.size) + "）" : ""}
        </p>
      </SettingsCardBody>
    </SettingsCard>
  );
}
