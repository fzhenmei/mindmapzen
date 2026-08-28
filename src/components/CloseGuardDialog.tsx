interface Props {
  mapName: string
  onChoice: (c: 'save' | 'discard' | 'cancel') => void
}

export default function CloseGuardDialog({ mapName, onChoice }: Readonly<Props>) {
  return (
    <div className="dialog-mask" role="dialog" aria-label="关闭确认">
      <div className="dialog">
        <h3>「{mapName}」有未保存的修改</h3>
        <div className="dialog-actions">
          <button type="button" data-testid="closeguard-cancel" onClick={() => onChoice('cancel')}>
            取消
          </button>
          <button
            type="button"
            data-testid="closeguard-discard"
            onClick={() => onChoice('discard')}
          >
            放弃修改
          </button>
          <button type="button" data-testid="closeguard-save" onClick={() => onChoice('save')}>
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  )
}
