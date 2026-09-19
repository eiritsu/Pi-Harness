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
}) {
  const [section, setSection] = useState<'general' | 'agent' | 'presets' | 'connections' | 'storage'>('agent');
  const [newTitle, setNewTitle] = useState('');

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
        <div className="settings-nav">
          {(['general', 'agent', 'presets', 'connections', 'storage'] as const).map((sec) => (
            <button
              key={sec}
              className={`settings-nav-item${section === sec ? ' active' : ''}`}
              onClick={() => setSection(sec)}
            >
              {sec === 'general' ? '通用' : sec === 'agent' ? 'Agent' : sec === 'presets' ? '预设库' : sec === 'connections' ? '连接器' : '存储'}
            </button>
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
          {section === 'general' && <p className="hint">语言、开机自启等 — v0.2 接入</p>}
          {section === 'connections' && <p className="hint">MCP / 连接器 — v0.3 接入</p>}
          {section === 'storage' && <p className="hint">会话数据目录与缓存清理 — v0.2 接入</p>}
        </div>
      </div>
    </div>
  );
}

export type { HarnessSettingsHost };
