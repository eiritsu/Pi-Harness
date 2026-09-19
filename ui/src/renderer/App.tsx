import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Envelope } from '@pi-harness/protocol/contract';
import { initialState, reduceEvent, reduceQueryResponse } from './store';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { KernelBanner } from './components/KernelBanner';
import { CommandPalette } from './components/CommandPalette';
import { EventLog } from './components/EventLog';
import { ToolPanel } from './components/ToolPanel';
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const queryIdRef = useRef(0);

  const queryRegistry = () => {
    queryIdRef.current += 1;
    window.harness.send({ channel: 'query', id: queryIdRef.current, payload: { kind: 'get_registry' } });
  };

  useEffect(() => {
    const off = window.harness.onEvent((envelope) => {
      dispatch({ type: 'event', envelope });
      if (envelope.channel === 'event' && envelope.payload.type === 'command_executed') {
        queryRegistry(); // 插件命令可能改动注册表 → 重查（幂等投影）
      }
    });
    // 启动即拉会话列表与注册表（幂等投影）
    queryIdRef.current += 1;
    window.harness.send({ channel: 'query', id: queryIdRef.current, payload: { kind: 'list_sessions' } });
    queryRegistry();
    return off;
  }, []);

  // ⌘K / Ctrl+K 命令面板；⌘\ 底部面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setBottomOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runCommand = (commandId: string) => {
    window.harness.send({
      channel: 'command',
      payload: { type: 'run_command', commandId, sessionId: state.currentSessionId ?? undefined },
    });
  };

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
        <Composer onSend={send} disabled={!state.currentSessionId} commands={state.registry?.commands ?? []} onRunCommand={runCommand} />
        {bottomOpen && <EventLog log={state.log} />}
      </main>
      <ToolPanel tools={state.registry?.tools ?? []} />
      <CommandPalette
        open={paletteOpen}
        commands={state.registry?.commands ?? []}
        onClose={() => setPaletteOpen(false)}
        onExecute={runCommand}
        onOpen={queryRegistry}
      />
    </div>
  );
}
