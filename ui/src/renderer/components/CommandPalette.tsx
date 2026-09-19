import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegistryCommandEntry } from '@pi-harness/protocol/contract';

const GROUP_LABELS: Record<string, string> = {
  action: '操作',
  navigate: '导航',
  session: '会话',
  settings: '设置',
};

/** cmdk 分组渲染（Codex 实测：group-heading + items） */
function groupCommands(cmds: RegistryCommandEntry[]): Array<{ group: string; items: RegistryCommandEntry[] }> {
  const order = ['action', 'navigate', 'session', 'settings'] as const;
  const out: Array<{ group: string; items: RegistryCommandEntry[] }> = [];
  for (const g of order) {
    const items = cmds.filter((c) => c.group === g);
    if (items.length > 0) out.push({ group: GROUP_LABELS[g] ?? g, items });
  }
  const rest = cmds.filter((c) => !(order as readonly string[]).includes(c.group));
  if (rest.length > 0) out.push({ group: '其他', items: rest });
  return out;
}

/**
 * ⌘K 命令面板 — 纯查表渲染。
 * 打开时重新拉取注册表：运行中新增的插件命令立即出现（M3 验收机制）。
 */
export function CommandPalette(props: {
  open: boolean;
  commands: RegistryCommandEntry[];
  onClose: () => void;
  onExecute: (commandId: string) => void;
  /** 打开面板时触发：重查注册表，运行中新增的插件命令立即出现 */
  onOpen?: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return props.commands;
    return props.commands.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [filter, props.commands]);

  useEffect(() => {
    if (props.open) {
      setFilter('');
      setActive(0);
      // 打开即刷新注册表（幂等投影）：运行中写入的插件行立即生效
      props.onOpen?.();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [props.open]);

  const groups = useMemo(() => groupCommands(filtered), [filtered]);

  if (!props.open) return null;

  const execute = (id: string) => {
    props.onExecute(id);
    props.onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
      return;
    }
    if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault();
      execute(filtered[active]!.id);
    }
  };

  return (
    <div className="palette-backdrop" data-testid="palette" onMouseDown={props.onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          data-testid="palette-input"
          className="palette-input"
          placeholder="输入命令…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {groups.map(({ group, items }) => (
            <div key={group} className="palette-group" role="group">
              <div className="palette-group-heading">{group}</div>
              {items.map((c) => {
                const flatIndex = filtered.findIndex((x) => x.id === c.id);
                return (
                  <button
                    key={c.id}
                    data-testid="palette-item"
                    className={`palette-item${flatIndex === active ? ' active' : ''}`}
                    onClick={() => execute(c.id)}
                    onMouseEnter={() => setActive(flatIndex)}
                  >
                    <span className="palette-title">{c.title}</span>
                    <span className="palette-meta">{c.id}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-empty">没有匹配的命令</div>}
        </div>
      </div>
    </div>
  );
}
