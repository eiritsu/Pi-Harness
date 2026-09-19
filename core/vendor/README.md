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

- [x] 快照落库
- [x] workspace 接入：`@earendil-works/*` 四包入 pnpm workspace，`Agent` 可从 `pi-agent-core` 导入
- [x] PiKernelDriver：faux 模型脚本 → Agent loop → protocol v1 事件面（含审批门）
- [ ] 真实 provider 接入（host 模型路由，nightly 冒烟）
- [ ] coding-agent core 工具集接入（当前 driver 仅内置 fs.write 最小工具）
- [ ] golden 回放对 PiKernelDriver 跑通（当前 golden 跑在 FakeKernelDriver 上）

## 快照补丁（元数据，非源码改动；升级快照时需重新套用）

1. 四包 `package.json`：`main`/`exports` 从 `./dist/*.js` 改指 `./src/*.ts`
   —— 消费模型是 vitest/esbuild 直连 TS 源，不复制上游 tsgo 构建链
2. 包间依赖 `^0.85.1` → `workspace:*`，强制互相解析到本快照而非 npm 旧版
3. `ai`：devDependencies 显式加 `@smithy/types`（bedrock 代码的类型传递依赖，
   pnpm 严格 node_modules 下不可省）
4. `ai/src/providers/data/*.json`（728K）：上游构建期产物，由
   `scripts/generate-models.ts --strict --data-only` 生成（需网络拉 models.dev 目录；
   生成脚本未入 vendor，按需从上游克隆运行）

## 升级流程（季度节奏）

1. `git clone --depth 1` 上游新 commit 到 /tmp
2. 只 diff provider 适配与安全修复，cherry-pick 进 `packages/ai` 与安全相关文件
3. 功能特性一律不跟
4. 重新跑 `kernel/` 全部 golden；绿了才更新本文件的 commit SHA
