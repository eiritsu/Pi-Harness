import type { SessionMeta } from '@pi-harness/protocol';

export function Sidebar(props: {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onNewSession: () => void;
}) {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <button className="primary new-chat" data-testid="new-chat" onClick={props.onNewSession}>
        新对话
      </button>
      <nav className="session-list" data-testid="session-list">
        {props.sessions.map((s) => (
          <div
            key={s.id}
            className={`session-row${s.id === props.currentSessionId ? ' active' : ''}`}
            data-testid="session-row"
          >
            {s.title}
          </div>
        ))}
        {props.sessions.length === 0 && <div className="session-empty">暂无会话</div>}
      </nav>
      <div className="sidebar-footer">Pi Harness v0.1</div>
    </aside>
  );
}
