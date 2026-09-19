import { useState } from 'react';
import type { KeyboardEvent } from 'react';

export function Composer(props: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (t.length === 0 || props.disabled) return;
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
      <textarea
        data-testid="composer-input"
        rows={1}
        placeholder={props.disabled ? '先创建一个新对话' : '给 Pi Harness 发消息…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
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
