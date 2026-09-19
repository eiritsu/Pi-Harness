# Pi H​a​r​n​e​s​s 开发方案 v0.1

> 定位：以 vendor pi 为内核、Codex 风格为外壳的桌面 Coding Agent。
> 原则：**壳硬编码，内容查注册表**。删光插件仍是完整客户端；任何新能力只加一行插件即可出现在 ⌘K / 设置 / 面板。
> 分工：AI agent 写全部代码与测试；用户负责真机安装、真实任务测试、bug 报告。

---

## 1. 目标 / 非目标

**目标**
- 默认态：零插件冷启动，体验对齐 Codex（三栏、⌘K、线程管理、设置 IA）。
- 扩展态：插件行（tool / service / ui.command / preset）驱动一切可扩展点。
- 权限三档 + auto：`read-only / s​a​n​d​b​o​x_workspace_write / full-access / auto`，宿主全局 + 预设可覆盖。
- 每个里程碑退出时，代码级测试闭环全绿。

**非目标（本期不做）**
- 插件商店 / 远端分发；多窗口之外的复杂窗口管理；Windows/Linux 打包（先 macOS DMG）。

---

## 2. 架构与目录

```
pi-harness/
├── protocol/        # RPC 契约：类型 + JSON Schema + 契约测试（最先冻结）
├── kernel/          # vendor pi 适配层：headless 驱动、事件流、审批栈对接
├── host/            # 宿主平面：持久化、沙箱/审批服务、模型路由、插件注册表
├── presets/         # 出厂 agent presets（cordis.yml，每预设一目录）
├── ui/
│   ├── src/main/    # Electron 主进程（host 服务内嵌于此）
│   └── src/renderer/# React 前端：三栏布局 / ⌘K / 设置
├── tests/
│   ├── contract/    # 双端对拉测试
│   ├── golden/      # 内核会话黄金回放
│   └── e2e/         # Playwright (Electron)
└── docs/
```

两平面落位：宿主 cordis.yml（approval service、fs tools、命令注册）在 `host/`；会话私有覆盖在 `presets/`，UI 的"预设库"即对此目录的视图。

---

## 3. 里程碑（M0–M6）

每个里程碑三列：产出 / 验证 / 退出标准。

### M0 契约先行（3–5 天）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| `protocol/`：会话事件流、工具调用、审批请求、权限枚举、命令/工具/预设注册表条目的类型 + JSON Schema；fake kernel + fake ui 双端参考实现 | 契约测试：fake-ui × fake-kernel 对拉跑通全部消息类型 | 两端测试全绿；schema 变更走版本号（`v1` 冻结） |

M0 是后面所有测试的地基——契约一旦冻结，内核与 UI 可并行开发、各自测试。

### M1 内核落地（1–1.5 周）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| vendor pi 适配层：单会话创建、流式输出、工具调用循环、审批栈（deny/approve/always）、会话持久化、模型路由（含 mock provider） | ① golden 回放：脚本化会话（含工具调用、拒绝、多轮）事件流与快照逐条一致；② 沙箱测试：三种权限档下 fs 工具在临时目录内跑，越界断言全部被拦 | 真实模型下一场端到端编码会话成功；golden 套件 ≥ 10 个场景 |

### M2 壳与布局（1 周）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| Electron 壳 + IPC 桥（接 protocol）+ 三栏布局静态骨架（会话列表 / 对话区 / 文件树）+ 底部面板挂点 | Playwright smoke：启动、发消息（mock 模型）、收流式回复渲染 | e2e 冒烟绿；主/渲染进程崩溃零容忍 |

### M3 ⌘K 与注册表（1 周）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| 命令/工具注册表（读宿主 cordis.yml）→ ⌘K 面板、工具面板、slash 命令全部查表渲染；权限档切换入口 | e2e：注册一行测试命令 → ⌘K 出现并执行；切权限档 → 审批行为随之变化 | "扩展态验收"通过：不改宿主代码、只加一行插件，新命令出现在 ⌘K |

### M4 设置与预设（1–1.5 周）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| 设置 IA（general/appearance/agent/connections/keyboard-shortcuts/storage…，语义按两平面拆分）；预设库：列表/新建/派生/删除；会话内热切换预设 | e2e：切预设 → 工具集与权限档即时变化；改全局设置 → 持久化并生效 | 默认态 + 扩展态双验收重跑全绿 |

### M5 打包分发（3–5 天）
| 产出 | 验证 | 退出标准 |
|---|---|---|
| asar 打包、DMG、Sparkle 应用内更新（检测→确认弹窗→下载→挂载→拖拽）、签名+公证 | 手测 checklist（用户执行）：全新安装 / 覆盖安装 / 升级流程 / 无网络降级 | 你在一台干净机器上 10 分钟内完成安装并发起首场会话 |

### M6 内测闭环（持续，进入循环）
见 §5。门槛：一轮 dogfood 的 P0/P1 bug 清零才进下一特性迭代。

> **M5 状态（2026-09-19）**：electron-builder 管线 ✅（asar 全量 bundle，240MB app / 100MB DMG）、
> 图标 icns 由 `assets/brand/pi-logo-on-dark.svg` 生成 ✅、应用内检查更新（GitHub Releases API →
> 设置页提示 → 打开下载页）✅、CI release workflow（tag 触发：构建→测试→发布 DMG）✅。
> **待用户提供**：Apple Developer 账号 → 开启签名+公证（electron-builder.yml 已留 identity 与
> notarize 注释位，填 secrets 即可）；Sparkle 自动更新二期再评估。
> 本地手测：`ui/release/Pi Harness-0.1.0-arm64.dmg` 挂载 → 拖入 Applications → 启动 →
> 新对话（mock 回声）→ 设置页检查更新。

---

## 4. 代码级测试闭环

四层，全进 CI（PR 门禁），逐层过滤：

| 层 | 工具 | 覆盖 | 速度 |
|---|---|---|---|
| L1 单元 | vitest | protocol 序列化、审批决策逻辑、注册表解析、preset 解析 | 秒级，随写随跑 |
| L2 契约 | 自研 harness | fake-ui × fake-kernel 全消息类型对拉；schema 兼容性（旧快照反序列化） | 秒级 |
| L3 内核集成 | vitest + golden | 黄金会话回放、审批矩阵（deny/approve × 三档权限）、沙箱越界 | 十秒级 |
| L4 端到端 | Playwright `_electron` | 真实 app 启动→会话→审批弹窗→⌘K→切预设，全程 mock 模型路由 | 分钟级 |

关键设计：
- **模型路由可注入**：`mock provider` 按脚本吐响应，测试确定性、零 token 成本；真实模型冒烟只放 nightly（可选，用你的 key）。
- **诊断即测试**：bug 的最小复现会话（见 §5）可直接转成 golden 场景，永久进 L3。
- **watch 模式**：`pnpm test:watch` 覆盖 L1–L3，我改代码时自跑；L4 在提交前跑。

CI 门禁：lint + typecheck + L1–L4 全绿才可合并。

---

## 5. 真实测试闭环（你 ↔ 我）

```
你真实使用 ──► 发现异常 ──► /export-diagnostics（会话事件+版本+预设快照，自动脱敏）
   ▲                                │
   │                                ▼
修复+回归测试 ◄── 我按层定位 ◄── 诊断包回放（诊断包必须可回放，做不到=协议缺口，先补协议）
```

- **入口**：应用内 `/export-diagnostics` 命令（M4 上线，M6 前可用手动导出脚本顶替）。
- **分级**：UI / kernel / protocol / packaging 四标签；能用诊断包回放的优先修。
- **规则**：每个 bug 先落一个失败测试（在它所属的层），再修——bug 全部转化为回归资产。
- **节奏**：每轮 dogfood 3–5 天，你按当轮 checklist 测试（M2 冒烟 / M3 命令扩展 / M4 设置预设 / M5 安装升级）；P0/P1 清零进下一轮。
- **你要做的**：真机安装、签名/公证账号、模型 API key、把 pi 用在真实项目上并报告"哪里不对劲"。

---

## 6. 风险

| 风险 | 缓解 |
|---|---|
| vendor pi 上游变动冲掉适配层 | 适配层薄且 golden 套件守边界；升级 = 跑 golden |
| 契约冻结过早/过晚 | M0 只冻结 v1 最小集（会话+审批+注册表查询）；schema 带版本号，允许 v2 并存 |
| Electron 打包后路径/权限与 dev 不一致 | M2 起所有 e2e 同时跑 dev 与打包产物两条路径 |
| 单人 dogfood 覆盖不足 | 每里程碑 checklist 明确到操作步骤；鼓励在真实项目（非玩具任务）里测 |

---

## 7. 立即开工

M0 三件事，我直接开写：
1. `protocol/` schema + 类型（权限枚举、事件流、注册表条目）
2. fake kernel / fake ui 参考实现
3. 契约测试套件 + `pnpm` 工作区脚手架 + CI 配置
