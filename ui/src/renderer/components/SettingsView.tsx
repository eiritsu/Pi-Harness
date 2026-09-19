import { useEffect, useState } from 'react';
import type { PermissionMode, PresetFile, HarnessSettingsHost } from '../host-types';
import { PERMISSION_ORDER, LABELS } from './PermissionBadge';

/** 设置页 — 分区导航；Agent 分区改默认权限档；Presets 分区是预设库 */
export function SettingsView(props: {
  open: boolean;
  onClose: () => void;
  presets: PresetFile[];
  onApplyPreset: (p: PresetFile) => void;
  onCreatePreset: (title: string) => void;
  onDerivePreset: (sourceId: string, title: string) => void;
  onDeletePreset: (id: string) => void;
  onSetDefaultPermission: (mode: PermissionMode) => void;
  defaultPermission: PermissionMode | undefined;
  version?: string;
  onCheckUpdate: () => void;
  checking?: boolean;
  updateNotice?: string;
}) {
  const [section, setSection] = useState<'general' | 'agent' | 'presets' | 'connections' | 'storage'>('agent');
  const [newTitle, setNewTitle] = useState('');

  // Codex 实测导航分组：personal / coding / integrations / archived
  const NAV_GROUPS: Array<{ heading: string; items: Array<{ id: typeof section; label: string }> }> = [
    { heading: '个人', items: [{ id: 'general', label: '通用' }] },
    { heading: '编码', items: [{ id: 'agent', label: 'Agent' }, { id: 'presets', label: '预设库' }] },
    { heading: '集成', items: [{ id: 'connections', label: '连接器' }] },
    { heading: '归档', items: [{ id: 'storage', label: '存储' }] },
  ];

  useEffect(() => {
    if (!props.open) return;
    setSection('agent');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div className="palette-backdrop" data-testid="settings" onMouseDown={props.onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-nav" aria-label="设置导航">
          {NAV_GROUPS.map((g) => (
            <div key={g.heading} className="settings-nav-group">
              <div className="settings-nav-heading">{g.heading}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={`settings-nav-item${section === it.id ? ' active' : ''}`}
                  onClick={() => setSection(it.id)}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="settings-body">
          {section === 'agent' && (
            <div data-testid="settings-agent">
              <h3>默认权限档</h3>
              <p className="hint">新建会话时自动应用（宿主全局设置；预设可在会话内覆盖）</p>
              <div className="perm-options">
                {PERMISSION_ORDER.map((m) => (
                  <button
                    key={m}
                    className={`perm-option${props.defaultPermission === m ? ' active' : ''}`}
                    data-testid={`default-perm-${m}`}
                    onClick={() => props.onSetDefaultPermission(m)}
                  >
                    {LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {section === 'presets' && (
            <div data-testid="settings-presets">
              <h3>预设库</h3>
              <div className="preset-new">
                <input
                  data-testid="preset-new-title"
                  placeholder="新预设名称"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <button
                  data-testid="preset-create"
                  disabled={newTitle.trim().length === 0}
                  onClick={() => {
                    props.onCreatePreset(newTitle.trim());
                    setNewTitle('');
                  }}
                >
                  新建
                </button>
              </div>
              <div className="preset-list">
                {props.presets.map((p) => (
                  <div key={p.id} className="preset-row" data-testid="preset-row">
                    <span className="preset-title">
                      {p.title}
                      {p.derivedFrom && <span className="preset-src"> （派生自 {p.derivedFrom}）</span>}
                    </span>
                    <span className="preset-mode">{LABELS[p.permissionMode]}</span>
                    <button data-testid="preset-apply" onClick={() => props.onApplyPreset(p)}>
                      应用
                    </button>
                    <button data-testid="preset-derive" onClick={() => props.onDerivePreset(p.id, `${p.title} 副本`)}>
                      派生
                    </button>
                    <button className="danger" data-testid="preset-delete" onClick={() => props.onDeletePreset(p.id)}>
                      删除
                    </button>
                  </div>
                ))}
                {props.presets.length === 0 && <p className="hint">暂无预设</p>}
              </div>
            </div>
          )}
          {section === 'general' && (
            <div data-testid="settings-general">
              <h3>关于</h3>
              <p className="hint">当前版本 {props.version ?? '—'}</p>
              <button data-testid="check-update" onClick={props.onCheckUpdate} disabled={props.checking}>
                {props.checking ? '检查中…' : '检查更新'}
              </button>
              {props.updateNotice && <p className="hint" data-testid="update-notice">{props.updateNotice}</p>}
            </div>
          )}
          {section === 'connections' && <p className="hint">MCP / 连接器 — v0.3 接入</p>}
          {section === 'storage' && <p className="hint">会话数据目录与缓存清理 — v0.2 接入</p>}
        </div>
      </div>
    </div>
  );
}

export type { HarnessSettingsHost };
