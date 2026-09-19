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
import { SettingsView } from './components/SettingsView';
import { PermissionBadge, nextMode } from './components/PermissionBadge';
import type { PresetFile, HarnessSettingsHost } from './host-types';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [presets, setPresets] = useState<PresetFile[]>([]);
  const [defaultPerm, setDefaultPerm] = useState<string | undefined>(undefined);
  const [sessionModes, setSessionModes] = useState<Record<string, string>>({});
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
        // host 语义：app.settings 打开设置页（UI 决定交互，kernel 只回执）
        if (envelope.payload.commandId === 'app.settings') setSettingsOpen(true);
      }
      if (envelope.channel === 'event' && envelope.payload.type === 'permission_changed') {
        const { sessionId, mode } = envelope.payload;
        setSessionModes((m) => ({ ...m, [sessionId]: mode }));
      }
    });
    // 启动即拉会话列表与注册表（幂等投影）
    queryIdRef.current += 1;
    window.harness.send({ channel: 'query', id: queryIdRef.current, payload: { kind: 'list_sessions' } });
    queryRegistry();
    // 宿主平面：设置与预设
    void window.hostApi?.request({ op: 'settings.get' }).then((r) => {
      if (r.ok && r.settings) setDefaultPerm(r.settings.agent?.defaultPermissionMode);
    });
    void window.hostApi?.request({ op: 'presets.list' }).then((r) => {
      if (r.ok && r.presets) setPresets(r.presets);
    });
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

  const refreshPresets = () => {
    void window.hostApi?.request({ op: 'presets.list' }).then((r) => {
      if (r.ok && r.presets) setPresets(r.presets);
    });
  };

  const applyPreset = (p: PresetFile) => {
    if (state.currentSessionId) {
      window.harness.send({
        channel: 'command',
        payload: { type: 'set_permission_mode', sessionId: state.currentSessionId, mode: p.permissionMode },
      });
    }
  };

  const setDefaultPermission = (mode: string) => {
    void window.hostApi?.request({ op: 'settings.set', section: 'agent', value: { defaultPermissionMode: mode } }).then((r) => {
      if (r.ok && r.settings) setDefaultPerm(r.settings.agent?.defaultPermissionMode);
    });
  };

  const cyclePermission = () => {
    const sid = state.currentSessionId;
    if (!sid) return;
    const cur = (sessionModes[sid] ?? defaultPerm ?? 'sandbox_workspace_write') as Parameters<typeof nextMode>[0];
    window.harness.send({
      channel: 'command',
      payload: { type: 'set_permission_mode', sessionId: sid, mode: nextMode(cur) },
    });
  };

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
        <Composer
          onSend={send}
          disabled={!state.currentSessionId}
          commands={state.registry?.commands ?? []}
          onRunCommand={runCommand}
          permission={state.currentSessionId ? (sessionModes[state.currentSessionId] ?? defaultPerm) as never : undefined}
          onCyclePermission={cyclePermission}
        />
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
      <SettingsView
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        presets={presets}
        onApplyPreset={applyPreset}
        onCreatePreset={(title) => {
          void window.hostApi?.request({ op: 'presets.create', title }).then(refreshPresets);
        }}
        onDerivePreset={(sourceId, title) => {
          void window.hostApi?.request({ op: 'presets.derive', sourceId, newTitle: title }).then(refreshPresets);
        }}
        onDeletePreset={(id) => {
          void window.hostApi?.request({ op: 'presets.delete', id }).then(refreshPresets);
        }}
        onSetDefaultPermission={setDefaultPermission}
        defaultPermission={defaultPerm as never}
      />
    </div>
  );
}
