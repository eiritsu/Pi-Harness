import type { RegistryToolEntry } from '@pi-harness/protocol/contract';

/** 右面板 — Codex 实测结构：快捷卡（审查/终端/浏览器/文件，带快捷键 chip）+ 工具注册表 */
export function ToolPanel(props: { tools: RegistryToolEntry[] }) {
  return (
    <aside className="right-panel" data-testid="right-panel">
      <button className="quick-card" data-testid="quick-review" disabled title="v0.4 接入">
        <span className="quick-ico">⊟</span> 审查
        <span className="quick-key">⇧⌘G</span>
      </button>
      <button className="quick-card" data-testid="quick-terminal" disabled title="v0.2 接入">
        <span className="quick-ico">▸_</span> 终端
        <span className="quick-key">^`</span>
      </button>
      <button className="quick-card" data-testid="quick-browser" disabled title="v0.4 接入">
        <span className="quick-ico">◎</span> 浏览器
        <span className="quick-key">⌘T</span>
      </button>
      <button className="quick-card" data-testid="quick-files" disabled title="v0.3 接入">
        <span className="quick-ico">🗂</span> 文件
        <span className="quick-key">⌘P</span>
      </button>

      <div className="nav-section" style={{ margin: '10px 2px 2px' }}>工具（注册表）</div>
      <div className="tool-list">
        {props.tools.map((t) => (
          <div key={t.name} className="tool-row" data-testid="tool-row">
            <span className="tool-row-name">{t.name}</span>
            <span className="tool-row-desc">{t.description}</span>
            <span className="tool-row-src">{t.source}</span>
          </div>
        ))}
        {props.tools.length === 0 && <div className="panel-empty">没有可用工具</div>}
      </div>
    </aside>
  );
}
