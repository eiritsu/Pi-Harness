/** 底部面板：内核事件日志（⌘\ 开关） */
export function EventLog(props: { log: string[] }) {
  return (
    <div className="bottom-panel" data-testid="bottom-panel">
      <div className="panel-title">事件</div>
      <pre className="event-log" data-testid="event-log">
        {props.log.length > 0 ? props.log.join('\n') : '（暂无事件）'}
      </pre>
    </div>
  );
}
