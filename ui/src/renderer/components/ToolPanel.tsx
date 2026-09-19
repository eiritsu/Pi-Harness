import type { RegistryToolEntry } from '@pi-harness/protocol/contract';

/** 右面板：工具列表 — 查注册表渲染，壳里没有硬编码工具名 */
export function ToolPanel(props: { tools: RegistryToolEntry[] }) {
  return (
    <aside className="right-panel" data-testid="right-panel">
      <div className="panel-title">工具（注册表）</div>
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
