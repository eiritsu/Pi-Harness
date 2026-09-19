# core/vendor — vendored pi（冻结快照）

> **冻结纪律**：本目录是上游快照，禁止手工编辑任何文件。
> 演进方式：改我们的适配层（`kernel/`），不改 vendor。上游只 cherry-pick 两类——provider 适配修复、安全修复。

## 溯源

- 上游：https://github.com/badlogic/pi-mono （MIT）
- 快照 commit：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`
- 快照日期：2026-09-19
- 协议版本：上游 protocol v1（PROTOCOL_VERSION 见 `packages/protocol`，未随快照引入，需要时回查）

## 裁剪清单（保留什么、砍掉什么）

| 上游包 | 处置 | 理由 |
|---|---|---|
| `packages/ai` | **保留** src | LLM provider 层（Anthropic/OpenAI/Google/Bedrock） |
| `packages/agent` | **保留** src | agent loop / 工具执行循环 |
| `packages/chord` | **保留** src | 上游 RPC 框架，agent/ai 的依赖闭包 |
| `packages/telemetry` | **保留** src | 依赖闭包（48K，后续可替换为 stub） |
| `packages/coding-agent/src/core` | **保留** | 工具实现、session-manager、extensions、skills |
| `packages/coding-agent` 其余（cli/tui/modes/client/experimental/export-html） | 砍 | TUI/CLI 前端，与我们的壳无关 |
| `packages/protocol` / `server` / `client` | 砍 | 上游 experimental RPC 面与我们的 protocol v1 平行；适配走 `kernel/` |
| `packages/session-backends` / `durable` / `evals` / `tui` | 砍 | 非目标 |

vendor 体积：约 4.4M（纯 src + package.json）。

## 接入状态

- [x] 快照落库（本轮）
- [ ] PiKernelDriver：驱动 `agent` loop，对接 protocol v1 事件面
- [ ] 依赖闭包解析（typebox / diff / ignore / yaml / partial-json 等第三方依赖）
- [ ] golden 回放对 PiKernelDriver 跑通（替换 FakeKernelDriver）

## 升级流程（季度节奏）

1. `git clone --depth 1` 上游新 commit 到 /tmp
2. 只 diff provider 适配与安全修复，cherry-pick 进 `packages/ai` 与安全相关文件
3. 功能特性一律不跟
4. 重新跑 `kernel/` 全部 golden；绿了才更新本文件的 commit SHA
