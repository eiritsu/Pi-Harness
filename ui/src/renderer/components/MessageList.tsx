import type { Message } from '@pi-harness/protocol/contract';

function ToolCard(props: { name: string; payload: Record<string, unknown> }) {
  return (
    <div className="tool-card" data-testid="tool-card">
      <span className="tool-name">⚙ {props.name}</span>
      <code className="tool-args">{JSON.stringify(props.payload)}</code>
    </div>
  );
}

export function MessageList(props: { messages: Message[]; streamingText: string }) {
  return (
    <div className="messages" data-testid="messages">
      {props.messages.map((m, i) => {
        if (m.role === 'user') {
          return (
            <div className="msg user" key={i}>
              {m.content.map((c, j) =>
                c.type === 'text' ? <span key={j}>{c.text}</span> : null,
              )}
            </div>
          );
        }
        return (
          <div className="msg assistant" key={i}>
            {m.content.map((c, j) => {
              if (c.type === 'text') return <p key={j}>{c.text}</p>;
              if (c.type === 'tool_call')
                return <ToolCard key={j} name={c.name} payload={c.args as Record<string, unknown>} />;
              return (
                <div key={j} className={`tool-result ${c.ok ? 'ok' : 'err'}`}>
                  {c.ok ? '✓' : '✗'} {c.output.slice(0, 200)}
                </div>
              );
            })}
          </div>
        );
      })}
      {props.streamingText.length > 0 && (
        <div className="msg assistant streaming" data-testid="streaming">
          <p>
            {props.streamingText}
            <span className="cursor">▍</span>
          </p>
        </div>
      )}
    </div>
  );
}
