import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import QRCode from 'qrcode'
import { useTranslation } from 'react-i18next'
import { showToast } from '../services/toast'

interface MobileSyncInfo {
  enabled: boolean
  port: number
  token: string
  ips: string[]
  current: string
}

/** 开关行样式:与 SettingsDialog 各分区 checkbox 行同款(cursor-pointer + primary 强调色) */
const SETTING_ROW = 'flex cursor-pointer select-none items-center gap-2'

// 手机同步设置分区(spec §5.1):开关(默认关,知情自选)+ 二维码配对 + IP 选择(多网卡)。
// 读写均走 Rust 命令(Task 4):get_mobile_sync_info / set_mobile_sync_config,两端都回 MobileSyncInfo
export default function MobileSyncSection() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<MobileSyncInfo | null>(null)
  const [ip, setIp] = useState('')
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    invoke<MobileSyncInfo>('get_mobile_sync_info')
      .then((v) => {
        setInfo(v)
        setIp(v.current || v.ips[0] || '')
      })
      .catch((e) => setErr(String(e)))
  }, [])

  useEffect(() => {
    if (info === null || ip === '' || info.token === '') return
    const url = `http://${ip}:${info.port}/#${info.token}`
    QRCode.toString(url, { type: 'svg', margin: 1, width: 160 })
      .then(setSvg)
      .catch((e) => console.error('二维码生成失败', e))
  }, [info, ip])

  async function toggle(enabled: boolean): Promise<void> {
    if (info === null) return
    try {
      const v = await invoke<MobileSyncInfo>('set_mobile_sync_config', { enabled, port: info.port })
      setInfo(v)
      setErr(null)
    } catch (e) {
      // 端口被占等启动失败:内联错误 + toast 双出口(吞异常禁令)
      console.error('手机同步服务切换失败', e)
      setErr(t('mobileSync.startFailed'))
      showToast(t('mobileSync.startFailed'))
    }
  }

  if (err !== null && info === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-destructive">{err}</p>
      </div>
    )
  }
  if (info === null) return null
  const pairingUrl = ip === '' ? '' : `http://${ip}:${info.port}/#${info.token}`
  return (
    <div className="flex flex-col gap-2">
      <label className={SETTING_ROW}>
        <input
          type="checkbox"
          className="cursor-pointer accent-primary"
          checked={info.enabled}
          onChange={(e) => void toggle(e.target.checked)}
          data-testid="mobile-sync-toggle"
        />
        <span>{t('mobileSync.toggle')}</span>
      </label>
      {err !== null && (
        <p data-testid="mobile-sync-error" role="alert" className="text-xs text-destructive">
          {err}
        </p>
      )}
      {info.enabled && (
        <>
          <p className="text-xs text-muted-foreground">{t('mobileSync.hint')}</p>
          <label className="text-xs flex items-center gap-2">
            {t('mobileSync.ipSelect')}
            <select value={ip} onChange={(e) => setIp(e.target.value)} data-testid="mobile-sync-ip-select" className="text-xs">
              {info.ips.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {/* dangerouslySetInnerHTML 内容为 qrcode 库生成的 SVG(path 数值属性),输入只有
              Rust 侧枚举的本机 IP/端口/令牌,无用户自由文本,XSS 面不存在 */}
          {svg !== '' && <div data-testid="mobile-sync-qr" className="w-40 h-40" dangerouslySetInnerHTML={{ __html: svg }} />}
          <p className="text-xs text-muted-foreground" data-testid="mobile-sync-pairing-url">
            {t('mobileSync.qrcodeHint')}
            {pairingUrl !== '' && ` —— ${pairingUrl}`}
          </p>
        </>
      )}
    </div>
  )
}
