export function KernelBanner(props: { status: 'starting' | 'ready' | 'busy' | 'error' }) {
  if (props.status !== 'error') return null;
  return (
    <div className="kernel-banner" data-testid="kernel-banner">
      内核已断开
      <button>重启内核</button>
      <button>安全模式</button>
    </div>
  );
}
