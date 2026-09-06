import { i18n } from '../i18n'
import type { FsAdapter } from '../types/files'

/** 迁移留档标记文件名：写在新配置同目录，证明一次性 com.tauri.dev → com.mindmapzen.app 配置迁移已发生 */
export const MIGRATED_MARKER = '.migrated-from-tauri-dev'

/** 旧配置一次性迁移（identifier 从 com.tauri.dev 改为 com.mindmapzen.app，appDataDir 随之变化）：
 *  旧 config 存在且新 config 不存在 → 复制内容到新路径 + 在新目录写迁移标记；旧文件不动。
 *  其余情况（新已有 / 旧缺失）不迁移返回 false——绝不覆盖新配置。 */
export async function migrateOldConfig(
  adapter: FsAdapter,
  newConfigPath: string,
  oldConfigPath: string,
): Promise<boolean> {
  if (!(await adapter.exists(oldConfigPath))) return false
  if (await adapter.exists(newConfigPath)) return false
  // 同目录推导（分隔符随原路径）：替换末段文件名得到标记路径
  const markerPath = newConfigPath.replace(/[\\/][^\\/]*$/, `/${MIGRATED_MARKER}`)
  const parent = newConfigPath.replace(/[\\/][^\\/]*$/, '')
  await adapter.ensureDir(parent)
  await adapter.writeTextFileAtomic(newConfigPath, await adapter.readTextFile(oldConfigPath))
  // 留档内容词典化(common.migrationMarker,随迁移时刻的界面语言;迁移先于配置加载,取系统语言预热值)
  await adapter.writeTextFileAtomic(
    markerPath,
    `${i18n.t('common.migrationMarker', { from: oldConfigPath, time: new Date().toISOString() })}\n`,
  )
  return true
}
