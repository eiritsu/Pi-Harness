import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Envelope } from '@pi-harness/protocol';
import { initialState, reduceEvent, reduceQueryResponse } from './store';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { KernelBanner } from './components/KernelBanner';
import { logoUrl } from './assets/logo';

declare global {
  interface Window {
    harness: {
      send(envelope: Envelope): void;
      onEvent(listener: (envelope: Envelope) => void): () => void;
    };
  }
}

let querySeq = 0;

export function App() {
  const [state, dispatch] = useReducer(
    (s: typeof initialState, action: { type: 'event'; envelope: Envelope }) => {
      const e = action.envelope;
      if (e.channel === 'event') return reduceEvent(s, e.payload);
      if (e.channel === 'query_response') return reduceQueryResponse(s, e.payload);
      return s;
    },
    initialState,
  );
  const queryIdRef = useRef(0);

  useEffect(() => {
    const off = window.harness.onEvent((envelope) => {
      dispatch({ type: 'event', envelope });
    });
    // 启动即拉会话列表（幂等投影）
    queryIdRef.current += 1;
    window.harness.send({ channel: 'query', id: queryIdRef.current, payload: { kind: 'list_sessions' } });
    return off;
  }, []);

  const newSession = () => {
    window.harness.send({ channel: 'command', payload: { type: 'create_session', projectId: null } });
  };

  const send = (text: string) => {
    if (!state.currentSessionId) {
      // 无会话先建一个，再由下一轮 composer 触发；冒烟路径由 e2e 先点新对话
      return;
    }
    window.harness.send({
      channel: 'command',
      payload: { type: 'send_user_message', sessionId: state.currentSessionId, text },
    });
  };

  const hasMessages = state.messages.length > 0 || state.streamingText.length > 0;
  const emptyState = useMemo(
    () => (
      <div className="empty" data-testid="empty-state">
        <img src={logoUrl} alt="Pi Harness" width={72} height={72} />
        <p>有什么可以帮你的？</p>
      </div>
    ),
    [],
  );

  return (
    <div className="app">
      <Sidebar
        sessions={state.sessions}
        currentSessionId={state.currentSessionId}
        onNewSession={newSession}
      />
      <main className="main">
        <KernelBanner status={state.kernelStatus} />
        <div className="thread" data-testid="thread">
          {hasMessages ? (
            <MessageList messages={state.messages} streamingText={state.streamingText} />
          ) : (
            emptyState
          )}
        </div>
        <Composer onSend={send} disabled={!state.currentSessionId} />
      </main>
      <aside className="right-panel" data-testid="right-panel">
        <div className="panel-title">文件树</div>
        <div className="panel-empty">M3 接入注册表后启用</div>
      </aside>
    </div>
  );
}
