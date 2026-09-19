import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RegistryCommandEntry } from '@pi-harness/protocol/contract';
import { PermissionBadge } from './PermissionBadge';

export function Composer(props: {
  onSend: (text: string) => void;
  disabled?: boolean;
  commands?: RegistryCommandEntry[];
  onRunCommand?: (commandId: string) => void;
  permission?: { mode: string } | string;
  onCyclePermission?: () => void;
}) {
  const [text, setText] = useState('');

  // slash 命令提示：输入 / 开头时按注册表过滤（查表渲染，不硬编码）
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
      return; // 歧义：等继续输入
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
      <textarea
        data-testid="composer-input"
        rows={1}
        placeholder={props.disabled ? '先创建一个新对话' : '给 Pi Harness 发消息…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <PermissionBadge
        mode={typeof props.permission === 'string' ? (props.permission as never) : undefined}
        onCycle={() => props.onCyclePermission?.()}
      />
      <button
        className="primary send"
        data-testid="composer-send"
        onClick={submit}
        disabled={props.disabled || text.trim().length === 0}
      >
        ↑
      </button>
    </div>
  );
}
