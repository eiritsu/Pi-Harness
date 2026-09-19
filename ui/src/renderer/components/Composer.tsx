import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RegistryCommandEntry } from '@pi-harness/protocol/contract';
import { PermissionBadge } from './PermissionBadge';

/** Composer — Codex 实测悬浮卡片：上下文 chips 行 / 输入 / 工具栏（+ 权限 圆形发送） */
export function Composer(props: {
  onSend: (text: string) => void;
  disabled?: boolean;
  commands?: RegistryCommandEntry[];
  onRunCommand?: (commandId: string) => void;
  permission?: string;
  onCyclePermission?: () => void;
}) {
  const [text, setText] = useState('');

  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || !props.commands) return [];
    const q = text.slice(1).toLowerCase();
    if (q === '') return props.commands.slice(0, 6);
    return props.commands.filter((c) => c.id.toLowerCase().includes(q)).slice(0, 6);
  }, [text, props.commands]);

  const runSlash = (id: string) => {
    props.onRunCommand?.(id);
    setText('');
  };

  const submit = () => {
    const t = text.trim();
    if (t.length === 0 || props.disabled) return;
    if (t.startsWith('/')) {
      const q = t.slice(1).toLowerCase();
      const exact = props.commands?.find((c) => c.id.toLowerCase() === q);
      if (exact) {
        runSlash(exact.id);
        return;
      }
      if (slashMatches.length === 1) {
        runSlash(slashMatches[0]!.id);
        return;
      }
      return;
    }
    props.onSend(t);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer" data-testid="composer">
        {slashMatches.length > 0 && (
          <div className="slash-hints" data-testid="slash-hints">
            {slashMatches.map((c) => (
              <button key={c.id} className="slash-hint" onClick={() => runSlash(c.id)}>
                <span>{c.title}</span>
                <code>{c.id}</code>
              </button>
            ))}
          </div>
        )}
        <div className="chips-row">
          <span className="context-chip" data-testid="chip-project">📁 项目</span>
          <span className="context-chip">💻 本地</span>
          <span className="context-chip">⎇ main</span>
        </div>
        <textarea
          data-testid="composer-input"
          rows={1}
          placeholder={props.disabled ? '先创建一个新对话' : '随心输入'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer-toolbar">
          <button className="icon-btn" data-testid="composer-attach" title="附加">+</button>
          <PermissionBadge
            mode={props.permission}
            onCycle={() => props.onCyclePermission?.()}
          />
          <span className="spacer" />
          <button
            className="send-btn"
            data-testid="composer-send"
            onClick={submit}
            disabled={props.disabled || text.trim().length === 0}
            title="发送"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
