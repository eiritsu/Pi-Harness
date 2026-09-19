import type { SessionMeta } from '@pi-harness/protocol/contract';
import { logoUrl } from '../assets/logo';

/** 侧栏 — Codex 实测结构：品牌行 / 功能导航 / 项目区 / 底部 */
export function Sidebar(props: {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onNewSession: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-brand">
        <img src={logoUrl} alt="" />
        <span className="brand-name">Pi Harness</span>
        <span className="brand-caret">▾</span>
        <div className="brand-actions">
          <button className="icon-btn" title="搜索（⌘K）" data-testid="brand-search">⌕</button>
        </div>
      </div>

      <nav className="nav-group">
        <button className="nav-row" data-testid="new-chat" onClick={props.onNewSession}>
          <span className="nav-icon">✎</span> 新对话
        </button>
        <button className="nav-row" data-testid="nav-scheduled">
          <span className="nav-icon">◷</span> 定时任务
        </button>
        <button className="nav-row" data-testid="nav-plugins">
          <span className="nav-icon">❖</span> 插件
        </button>
      </nav>

      <div className="nav-section">项目</div>
      <div className="session-list" data-testid="session-list">
        {props.sessions.map((s) => (
          <button
            key={s.id}
            className={`session-row${s.id === props.currentSessionId ? ' active' : ''}`}
            data-testid="session-row"
          >
            {s.title}
          </button>
        ))}
        {props.sessions.length === 0 && <div className="session-empty">暂无会话</div>}
      </div>

      <div className="sidebar-footer">
        <button className="nav-row" data-testid="sidebar-settings" onClick={props.onOpenSettings}>
          <span className="nav-icon">⚙</span> 设置
        </button>
      </div>
    </aside>
  );
}
