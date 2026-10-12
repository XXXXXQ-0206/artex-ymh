"use client";

import * as React from "react";

import Link from "next/link";

import { toast } from "sonner";

import { SettingsCard, SettingsCardBody, SettingsRow, SettingsSection } from "@/codex-ui/codex/settings/SettingsRow";
import { SettingsButton, SettingsField, SettingsSelect, SettingsSwitch } from "@/codex-ui/codex/settings/controls";
import { Button, Input } from "@/codex-ui/codex/ui";
import { api } from "@/lib/api";
import { CHAT_SEND_MODE_OPTIONS, type ChatSendMode, setChatSendMode, useChatSendMode } from "@/lib/chat-send-mode";
import type { Settings } from "@/lib/types";
import { settingsPanelItems } from "@/navigation/sidebar/sidebar-items";

import { AppearanceControls } from "@/app/(main)/_components/sidebar/layout-controls";

import "./codex-settings.css";

import { UpdateCard } from "./_components/update-card";

/**
 * 网络搜索来源（原先是内联在 <SelectItem> 里的四行，抽成数据只为复用官方下拉触发器）。
 * value 与旧实现逐字一致，行为不变。
 */
const SEARCH_BACKEND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ddgs", label: "DuckDuckGo（ddgs · 免费无 Key）" },
  { value: "brave-free", label: "Brave（免费版 · 需 Key）" },
  { value: "tavily", label: "Tavily（需 Key）" },
  { value: "deepseek", label: "DeepSeek（官方）" },
];

/**
 * ARTEX 设置页（/system/settings）。
 *
 * ★ 表现层 = **逐字节移植**的壳组件（web/src/codex-ui/codex/**，见 task-5）：
 *   SettingsSection / SettingsCard / SettingsCardBody / SettingsRow（壳 src/settings/SettingsRow.tsx）
 *   SettingsSwitch / SettingsSelect / SettingsButton / SettingsField（壳 src/settings/controls.tsx）
 *   Button / Input（壳 src/ui/**）
 *   页面骨架类 cx-settings__shell / __page / __header / __title / __column 与文本类
 *   cx-settings-note / cx-settings-field__warn 全部来自壳的 settings.css 原文。
 *   ★ 本文件**不含任何自写的尺寸 / 字号 / 颜色常量**：全部是数据接线与组件组合。
 *
 * 数据层（hooks / API / 开关状态）一个字没动：所有 setState / api.setSettings 调用与旧实现等价。
 */
export default function SystemSettingsPage() {
  // 面板换成 Codex 式设置导航（见 globals.css 的 html[data-settings-nav="on"] 规则）
  React.useEffect(() => {
    document.documentElement.dataset.settingsNav = "on";
    return () => {
      delete document.documentElement.dataset.settingsNav;
    };
  }, []);

  const [trafficCapture, setTrafficCapture] = React.useState(false);
  const [agentTrafficBinding, setAgentTrafficBinding] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [backend, setBackend] = React.useState("ddgs");
  const [braveKeySet, setBraveKeySet] = React.useState(false);
  const [braveKeyInput, setBraveKeyInput] = React.useState("");
  const [tavilyKeySet, setTavilyKeySet] = React.useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = React.useState("");
  const [savingTavilyKey, setSavingTavilyKey] = React.useState(false);
  const [proxyInput, setProxyInput] = React.useState("");
  const [savingProxy, setSavingProxy] = React.useState(false);
  const [globalProxyInput, setGlobalProxyInput] = React.useState("");
  const [savingGlobalProxy, setSavingGlobalProxy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [pyInterp, setPyInterp] = React.useState("");
  const [workers, setWorkers] = React.useState("3");
  const [savingWorkers, setSavingWorkers] = React.useState(false);
  // 操作约束注入范围(默认都开)。
  const [injectPlanner, setInjectPlanner] = React.useState(true);
  const [injectWorker, setInjectWorker] = React.useState(true);
  // 纯前端偏好：不走 /api/settings，直接读写 localStorage。
  const sendMode = useChatSendMode();

  const apply = React.useCallback((s: Settings) => {
    setTrafficCapture(!!s.traffic_capture);
    setAgentTrafficBinding(!!s.agent_traffic_binding);
    setWebSearch(!!s.web_search_enabled);
    setBackend(s.web_search_backend || "ddgs");
    setBraveKeySet(!!s.brave_key_set);
    setTavilyKeySet(!!s.tavily_key_set);
    setProxyInput(s.web_search_proxy ?? "");
    setGlobalProxyInput(s.global_proxy ?? "");
    setPyInterp(s.python_interpreter ?? "");
    setWorkers(String(s.workers ?? 3));
    setInjectPlanner(s.constraints_inject_planner !== false);
    setInjectWorker(s.constraints_inject_worker !== false);
  }, []);

  const saveWorkers = () => {
    const n = Number(workers);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("并发数必须是大于 0 的整数");
      return;
    }
    setSavingWorkers(true);
    api
      .setSettings({ workers: n })
      .then((s) => {
        apply(s);
        toast.success("已保存并发工作 agent 数（对之后启动的任务生效）");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSavingWorkers(false));
  };

  const savePython = () => {
    setSaving(true);
    api
      .setSettings({ python_interpreter: pyInterp.trim() })
      .then((s) => {
        apply(s);
        toast.success("已保存 Python 解释器配置");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSaving(false));
  };
  const detectPython = () => {
    setSaving(true);
    api
      .detectPython()
      .then((r) => setPyInterp(r.python_interpreter))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  React.useEffect(() => {
    api
      .settings()
      .then(apply)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [apply]);

  const toggleTraffic = (v: boolean) => {
    setTrafficCapture(v); // optimistic
    setSaving(true);
    api
      .setSettings({ traffic_capture: v })
      .then(apply)
      .catch(() => setTrafficCapture(!v)) // revert on failure
      .finally(() => setSaving(false));
  };

  const toggleInjectPlanner = (v: boolean) => {
    setInjectPlanner(v); // optimistic
    api
      .setSettings({ constraints_inject_planner: v })
      .then(apply)
      .catch(() => setInjectPlanner(!v)); // revert on failure
  };

  const toggleAgentTrafficBinding = (v: boolean) => {
    setAgentTrafficBinding(v);
    setSaving(true);
    api
      .setSettings({ agent_traffic_binding: v })
      .then((s) => {
        apply(s);
        toast.success(v ? "已开启 Agent 自动绑定流量" : "已关闭 Agent 自动绑定流量");
      })
      .catch((e) => {
        setAgentTrafficBinding(!v);
        toast.error("保存失败：" + (e as Error).message);
      })
      .finally(() => setSaving(false));
  };

  const toggleInjectWorker = (v: boolean) => {
    setInjectWorker(v); // optimistic
    api
      .setSettings({ constraints_inject_worker: v })
      .then(apply)
      .catch(() => setInjectWorker(!v)); // revert on failure
  };

  // Persist a web-search patch (enable and/or backend). Optimistic with refetch.
  const saveWebSearch = (patch: Partial<Settings>) => {
    setSaving(true);
    api
      .setSettings(patch)
      .then((s) => {
        apply(s);
        toast.success("已保存网络搜索配置");
      })
      .catch((e) => {
        toast.error("保存失败：" + (e as Error).message);
        api
          .settings()
          .then(apply)
          .catch(() => undefined);
      })
      .finally(() => setSaving(false));
  };

  const saveBraveKey = () => {
    setSavingKey(true);
    api
      .setSettings({ brave_search_api_key: braveKeyInput })
      .then((s) => {
        apply(s);
        setBraveKeyInput("");
        toast.success("已保存 Brave API Key");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSavingKey(false));
  };

  const saveTavilyKey = () => {
    setSavingTavilyKey(true);
    api
      .setSettings({ tavily_search_api_key: tavilyKeyInput })
      .then((s) => {
        apply(s);
        setTavilyKeyInput("");
        toast.success("已保存 Tavily API Key");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSavingTavilyKey(false));
  };

  const saveProxy = () => {
    setSavingProxy(true);
    api
      .setSettings({ web_search_proxy: proxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(proxyInput.trim() ? "已保存出口代理" : "已清除出口代理（改为直连）");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSavingProxy(false));
  };

  const saveGlobalProxy = () => {
    setSavingGlobalProxy(true);
    api
      .setSettings({ global_proxy: globalProxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(globalProxyInput.trim() ? "已保存全局代理" : "已清除全局代理（改为直连）");
      })
      .catch((e) => toast.error("保存失败：" + (e as Error).message))
      .finally(() => setSavingGlobalProxy(false));
  };

  // Run a real "test" search ("test") against the CURRENT form values (backend +
  // proxy + entered key), falling back to saved values server-side. Toasts result.
  const runTest = () => {
    setTesting(true);
    api
      .testWebSearch({
        web_search_backend: backend,
        web_search_proxy: proxyInput.trim(),
        brave_search_api_key: braveKeyInput,
        tavily_search_api_key: tavilyKeyInput,
      })
      .then((r) => {
        if (r.ok) toast.success("搜索测试成功 · " + r.backend + " 返回 " + r.count + " 条结果");
        else toast.error("搜索测试失败：" + (r.error || "未知错误"));
      })
      .catch((e) => toast.error("搜索测试失败：" + (e as Error).message))
      .finally(() => setTesting(false));
  };

  // brave-free selected but no key stored and none being entered → tool stays off.
  const braveNeedsKey = webSearch && backend === "brave-free" && !braveKeySet;

  return (
    // 骨架 = 壳 SettingsPage 的结构（cx-settings__shell ▸ __page ▸ __header/__title + __page ▸ __column）；
    // 官方那 46px 空拖拽带由滚动容器的上内距承担（见 codex-settings.css 的说明）。
    <div className="cx-settings" data-codex-settings>
      <div className="cx-settings__shell">
        <div className="cx-settings__page">
          <header className="cx-settings__header">
            <h1 className="cx-settings__title">常规</h1>
          </header>
        </div>
      </div>

      <div className="cx-settings__page">
        <div className="cx-settings__column">
          {/* 外观：官方把「模式 / 字体 / 布局」这类偏好放在 设置 → 个人 → 外观；
              控件与持久化逻辑原样复用（AppearanceControls）。 */}
          <div id="appearance">
            <SettingsSection title="外观">
              <SettingsCard>
                <AppearanceControls />
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="update">
            <SettingsSection title="版本与更新">
              <UpdateCard />
            </SettingsSection>
          </div>

          <div id="traffic">
            <SettingsSection title="流量捕获">
              <SettingsCard>
                <SettingsRow
                  control={
                    <SettingsSwitch
                      checked={trafficCapture}
                      disabled={!loaded || saving}
                      label="流量捕获"
                      onChange={toggleTraffic}
                    />
                  }
                  description="开启后，所有 Agent 的 HTTP 流量经记录代理全量落库，并向 Agent 注入 traffic_search / traffic_get 工具与代理配置（提示词含代理说明）。切换后会即时重建 Agent 生效。"
                  label="流量捕获"
                />
                <SettingsCardBody>
                  <p className="cx-settings-note">
                    关闭（默认）时不记录任何流量：Agent 不会拿到代理配置与流量工具，提示词也不含代理相关内容。
                  </p>
                </SettingsCardBody>
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="auto-bind">
            <SettingsSection title="Agent 自动绑定流量">
              <SettingsCard>
                <SettingsRow
                  control={
                    <SettingsSwitch
                      checked={agentTrafficBinding}
                      disabled={!loaded || saving}
                      label="Agent 自动绑定流量"
                      onChange={toggleAgentTrafficBinding}
                    />
                  }
                  description="默认关闭。开启后，漏洞入库时触发的报告 Agent 会核对已有 HTTP 请求/响应，关联对应流量后再编写报告。查阅数据包及额外的工具调用会增加 Token 消耗。"
                  label="Agent 自动绑定流量"
                />
                <SettingsCardBody>
                  <p className="cx-settings-note">
                    TCP、未抓包或没有匹配流量时仍可正常上报。此开关不影响流量捕获、人工绑定及已保存证据的查看。
                    对下一轮 Agent 生效；关闭后会立即拒绝新的自动绑定。
                  </p>
                </SettingsCardBody>
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="proxy">
            <SettingsSection title="全局代理">
              <SettingsCard>
                <SettingsCardBody>
                  <div className="cx-settings-fields">
                    <SettingsField
                      help="所有 Agent 的目标流量经此代理出网（隐藏源 IP / 走跳板）。支持 http / https / socks5，可带 user:pass 认证。留空=直连。"
                      htmlFor="global-proxy"
                      label="代理地址"
                    >
                      <Input
                        autoComplete="off"
                        disabled={!loaded || savingGlobalProxy}
                        id="global-proxy"
                        onChange={(e) => setGlobalProxyInput(e.target.value)}
                        placeholder="socks5://user:pass@host:1080 或 http://host:port（留空=直连）"
                        value={globalProxyInput}
                      />
                    </SettingsField>
                  </div>
                </SettingsCardBody>
                <SettingsRow
                  control={
                    <SettingsButton disabled={!loaded || savingGlobalProxy} onClick={saveGlobalProxy}>
                      保存
                    </SettingsButton>
                  }
                  description={
                    globalProxyInput.trim() ? "已配置 · 所有目标流量经此代理出网" : "未配置 · 目标流量直连出网"
                  }
                  label="保存代理设置"
                />
                <SettingsCardBody>
                  <p className="cx-settings-note">
                    开启流量捕获时，它作为记录代理的上游（流量仍全量落库，再经此代理出网）；关闭捕获时，直接注入 Agent 的
                    bash / WebFetch 出网。与网络搜索代理、LLM 代理相互独立。
                  </p>
                  <p className="cx-settings-note">
                    提示：socks5 在关闭捕获时依赖各命令行工具对 ALL_PROXY 的支持（curl 可用，部分工具可能忽略）；
                    若主要用 socks5，建议开启流量捕获 —— 此路径由 MITM 亲自拨号，工具无感知、稳定生效。
                  </p>
                </SettingsCardBody>
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="constraints">
            <SettingsSection title="操作约束注入">
              <SettingsCard>
                <SettingsRow
                  control={
                    <SettingsSwitch
                      checked={injectPlanner}
                      disabled={!loaded}
                      label="注入规划者（planner）"
                      onChange={toggleInjectPlanner}
                    />
                  }
                  description="把每个任务的操作约束拼进规划者（planner）的系统提示，用来框定探索边界。"
                  label="注入规划者（planner）"
                />
                <SettingsRow
                  control={
                    <SettingsSwitch
                      checked={injectWorker}
                      disabled={!loaded}
                      label="注入执行者（worker）"
                      onChange={toggleInjectWorker}
                    />
                  }
                  description="把每个任务的操作约束拼进执行者（worker）的系统提示，用来框定探索边界。"
                  label="注入执行者（worker）"
                />
                <SettingsCardBody>
                  <p className="cx-settings-note">
                    约束来自任务总览「操作约束」里维护的 allow/deny 条目（如「仅测当前端口」「禁止爆破」），默认都开。
                    切换即时生效（下一轮读取），无需重建 Agent；关闭后该 Agent 不再看到约束。
                  </p>
                </SettingsCardBody>
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="websearch">
            <SettingsSection title="网络搜索">
              <SettingsCard>
                <SettingsRow
                  control={
                    <SettingsSwitch
                      checked={webSearch}
                      disabled={!loaded || saving}
                      label="网络搜索总开关"
                      onChange={(v) => {
                        setWebSearch(v); // optimistic
                        saveWebSearch({ web_search_enabled: v });
                      }}
                    />
                  }
                  description="这是网络搜索的总开关 + 来源配置。开启后，才能在每个 Agent 的配置里单独选择是否启用 web_search（仅返回标题/链接/摘要，不抓取正文；抓取由 WebFetch 负责）。"
                  label="总开关"
                />

                {webSearch && (
                  <SettingsRow
                    control={
                      <SettingsSelect
                        disabled={!loaded || saving}
                        label="搜索来源"
                        onChange={(v) => {
                          setBackend(v); // optimistic
                          saveWebSearch({ web_search_backend: v });
                        }}
                        options={SEARCH_BACKEND_OPTIONS}
                        value={backend}
                      />
                    }
                    description="网络搜索不走记录代理，独立于流量捕获。总开关关闭时，各 Agent 的网络搜索开关不可用。"
                    label="搜索来源"
                  />
                )}

                {webSearch && backend === "deepseek" && (
                  <>
                    <SettingsRow
                      description="该来源直接复用当前激活的 LLM 配置，因此仅支持 DeepSeek 官方模型，且该配置必须使用 anthropic 协议 —— DeepSeek 的 OpenAI 协议端点不支持服务端搜索。切换 LLM 配置后此来源可能失效。"
                      label="DeepSeek 官方联网搜索"
                    />
                    <SettingsCardBody>
                      <p className="cx-settings-note">
                        与其它来源不同，搜索由 DeepSeek 服务端执行：每次搜索会额外消耗一次模型调用（产生 Token
                        费用），搜索请求不经过上面的出口代理，也不计入流量留痕；返回结果只有标题和链接（无摘要），需要正文时由
                        WebFetch 抓取。
                      </p>
                      <p className="cx-settings-note">
                        是否满足上述条件由你自行确认，系统不做拦截；可用下方「测试搜索」按钮实际跑一次来验证。
                      </p>
                    </SettingsCardBody>
                  </>
                )}

                {webSearch && backend === "brave-free" && (
                  <>
                    <SettingsCardBody>
                      <div className="cx-settings-fields">
                        <SettingsField
                          help={
                            braveKeySet
                              ? "已配置 · 免费版额度约 2,000 次/月"
                              : "尚未配置 —— 在保存 Key 之前，搜索工具不会启用。免费版额度约 2,000 次/月"
                          }
                          htmlFor="brave-key"
                          label="Brave Search API Key"
                        >
                          <Input
                            autoComplete="off"
                            disabled={!loaded || savingKey}
                            id="brave-key"
                            onChange={(e) => setBraveKeyInput(e.target.value)}
                            placeholder={braveKeySet ? "已配置（留空则不变）" : "输入 Brave API Key"}
                            type="password"
                            value={braveKeyInput}
                          />
                        </SettingsField>
                      </div>
                      {braveNeedsKey ? (
                        <p className="cx-settings-field__warn">
                          已选择 Brave 但尚未配置 Key —— 在保存 Key 之前，搜索工具不会启用。
                        </p>
                      ) : null}
                    </SettingsCardBody>
                    <SettingsRow
                      control={
                        <SettingsButton
                          disabled={!loaded || savingKey || braveKeyInput.trim() === ""}
                          onClick={saveBraveKey}
                        >
                          保存
                        </SettingsButton>
                      }
                      description="前往 https://brave.com/search/api/ 获取 Key。"
                      label="保存 Brave Key"
                    />
                  </>
                )}

                {webSearch && backend === "tavily" && (
                  <>
                    <SettingsCardBody>
                      <div className="cx-settings-fields">
                        <SettingsField
                          help={tavilyKeySet ? "已配置" : "尚未配置 —— 在保存 Key 之前，搜索工具不会启用"}
                          htmlFor="tavily-key"
                          label="Tavily Search API Key"
                        >
                          <Input
                            autoComplete="off"
                            disabled={!loaded || savingTavilyKey}
                            id="tavily-key"
                            onChange={(e) => setTavilyKeyInput(e.target.value)}
                            placeholder={tavilyKeySet ? "已配置（留空则不变）" : "输入 Tavily API Key（tvly-…）"}
                            type="password"
                            value={tavilyKeyInput}
                          />
                        </SettingsField>
                      </div>
                    </SettingsCardBody>
                    <SettingsRow
                      control={
                        <SettingsButton
                          disabled={!loaded || savingTavilyKey || tavilyKeyInput.trim() === ""}
                          onClick={saveTavilyKey}
                        >
                          保存
                        </SettingsButton>
                      }
                      description="前往 https://tavily.com 注册并获取 API Key。"
                      label="保存 Tavily Key"
                    />
                  </>
                )}

                {webSearch && (
                  <>
                    <SettingsCardBody>
                      <div className="cx-settings-fields">
                        <SettingsField
                          help="独立出口代理，仅用于访问搜索端点（VPN/SOCKS 等）。与记录流量的 MITM 代理无关；网络不通时经此代理访问。"
                          htmlFor="ws-proxy"
                          label="出口代理（可选）"
                        >
                          <Input
                            autoComplete="off"
                            disabled={!loaded || savingProxy}
                            id="ws-proxy"
                            onChange={(e) => setProxyInput(e.target.value)}
                            placeholder="http://host:port 或 socks5://host:port（留空=直连）"
                            value={proxyInput}
                          />
                        </SettingsField>
                      </div>
                    </SettingsCardBody>
                    <SettingsRow
                      control={
                        <SettingsButton disabled={!loaded || savingProxy} onClick={saveProxy}>
                          保存
                        </SettingsButton>
                      }
                      description="留空即直连；保存后立即对下一次搜索生效。"
                      label="保存出口代理"
                    />
                    <SettingsRow
                      control={
                        <SettingsButton disabled={!loaded || testing} onClick={runTest}>
                          {testing ? "测试中…" : "测试搜索"}
                        </SettingsButton>
                      }
                      description="用当前配置（来源 + 代理 + Key）实际搜索一次「test」，验证是否可用。"
                      label="测试搜索"
                    />
                  </>
                )}
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="python">
            <SettingsSection title="自定义脚本 · Python 解释器">
              <SettingsCard>
                <SettingsCardBody>
                  <div className="cx-settings-fields">
                    <SettingsField
                      help="自定义 script 类型工具用它跑 Python。开机会自动检测（python3 优先）；此处可手填 venv / 特定版本的绝对路径，留空则运行时自动检测。"
                      htmlFor="python-interpreter"
                      label="Python 解释器"
                    >
                      <Input
                        disabled={!loaded || saving}
                        id="python-interpreter"
                        onChange={(e) => setPyInterp(e.target.value)}
                        placeholder="/usr/bin/python3（留空=自动检测）"
                        value={pyInterp}
                      />
                    </SettingsField>
                  </div>
                </SettingsCardBody>
                <SettingsRow
                  control={
                    <>
                      <SettingsButton disabled={!loaded || saving} onClick={detectPython}>
                        重新检测
                      </SettingsButton>
                      <SettingsButton disabled={!loaded || saving} onClick={savePython}>
                        保存
                      </SettingsButton>
                    </>
                  }
                  description="「重新检测」只把检测结果填回输入框，点「保存」才落库。"
                  label="解释器操作"
                />
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="concurrency">
            <SettingsSection title="工作并发 · Work Agent 数">
              <SettingsCard>
                <SettingsCardBody>
                  <div className="cx-settings-fields">
                    <SettingsField
                      help="每个任务并发运行的工作 agent 数量（默认 3）。数值越大并发探测越多、消耗也越高。修改后对之后启动的任务生效，正在运行的任务不受影响。"
                      htmlFor="workers"
                      label="Work Agent 数"
                    >
                      <Input
                        disabled={!loaded || savingWorkers}
                        id="workers"
                        min={1}
                        onChange={(e) => setWorkers(e.target.value)}
                        placeholder="3"
                        type="number"
                        value={workers}
                      />
                    </SettingsField>
                  </div>
                </SettingsCardBody>
                <SettingsRow
                  control={
                    <SettingsButton disabled={!loaded || savingWorkers} onClick={saveWorkers}>
                      保存
                    </SettingsButton>
                  }
                  description="必须是大于 0 的整数。"
                  label="保存并发数"
                />
              </SettingsCard>
            </SettingsSection>
          </div>

          <div id="sendkey">
            <SettingsSection title="会话输入框发送键位">
              <SettingsCard>
                <SettingsRow
                  control={
                    <SettingsSelect
                      label="发送方式"
                      onChange={(v) => setChatSendMode(v as ChatSendMode)}
                      options={CHAT_SEND_MODE_OPTIONS}
                      value={sendMode}
                    />
                  }
                  description="对话页与任务详情的主 Agent 会话输入框共用此设置，选择后立即生效、无需保存。该偏好只存在本浏览器，不随账号同步，换浏览器或清理站点数据后需重新设置。"
                  label="发送方式"
                />
              </SettingsCard>
            </SettingsSection>
          </div>

          {/* 平台入口仍保留给现有导航项，但放在真实运行时设置之后，避免抢占常规页首屏。 */}
          <div id="panel">
            <SettingsSection title="更多入口">
              <SettingsCard>
                {settingsPanelItems.map((p) => (
                  <SettingsRow
                    control={
                      <Button asChild size="sm" variant="soft">
                        <Link href={p.url} prefetch={false}>
                          打开
                        </Link>
                      </Button>
                    }
                    description={p.url}
                    key={p.id}
                    label={p.title}
                  />
                ))}
              </SettingsCard>
            </SettingsSection>
          </div>
        </div>
      </div>
    </div>
  );
}
