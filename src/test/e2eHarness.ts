import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { pasteImageName } from '../services/pasteImage'
import type { PickedImport } from '../views/LibraryView'

/** 固定 1×1 透明 PNG 字节（IHDR 宽高 1×1，尺寸解析链路真实可跑）：选图/读剪贴板桩共用 */
function harnessPngBytes(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 签名
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 宽 1 高 1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, // 8bit RGBA + CRC
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])
}

/** 仅 E2E 使用（?e2e=1）：以内存文件系统启动并暴露读取钩子。
 *  末尾自动 setWorkspace('/ws')，规避 web 模式下无 Tauri 目录选择对话框的问题。
 *  ?desk=1 追加班头预置（/ws/项目/项目图.md + /ws/根图.md）：仅 desk.spec 使用——
 *  预置须先于 setWorkspace 写盘（refreshMaps/左树在 setWorkspace 时生成），
 *  且不能无条件预置：多文件会破坏既有用例对树文件行的单例（严格模式）断言。
 *  ?nows=1 跳过 setWorkspace（保持无工作区首启态）：仅 welcome.spec 开屏流程使用——
 *  点 btn-welcome-create 后经 pickDirectory 桩（固定返回 /ws）走真实 setWorkspace 链路。
 *  引导预设：默认预写 /cfg.json tourDone:true（须先于 setWorkspace，load-merge-save 保留），
 *  仅 ?tour=1 时写 false——tour.spec 显式要求看引导；?tourdone=1 与默认等效（语义自述）。
 *  不预写 false 的原因同 ?desk=1：引导遮罩全屏拦截交互，既有 ?e2e=1 用例会被挡住 */
export async function installE2eHarness(): Promise<void> {
  const fs = new MemoryFsAdapter()
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ configPath: '/cfg.json' })
  ;(window as unknown as Record<string, unknown>).__zenE2e = {
    async readFile(path: string): Promise<string> {
      return fs.readTextFile(path)
    },
    // 写内存工作区并刷新案头清单（M18 起 spec 预置用）。注意必须走本通道而非
    // evaluate 裸动态 import store——HMR 失效后裸 URL 会解析出与 app 不同的
    // 模块实例（store 初始态），本方法持 harness 装配时的真实引用（已实证）
    async writeFile(path: string, text: string): Promise<void> {
      await fs.writeTextFileAtomic(path, text)
      await useAppStore.getState().refreshMaps()
    },
    // git 命令桩（M20 版本管理）：记录命令序列供断言；gitAnswers 可配置应答（缺省恒 ok）
    gitCalls: [] as string[],
    gitAnswers: [] as Array<{ match: string; ok: boolean; out?: string; err?: string }>,
    // 二进制写（M19 插图：预置图片字节），同样不刷新清单（图片非导图）
    async writeBytes(path: string, base64: string): Promise<void> {
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i)!
      await fs.writeBytes(path, bytes)
    },
    // 剪贴板桩：App E2E 装配的 writeClipboard 将复制内容记录于此，供 spec 断言
    lastCopied: null as string | null,
    // 导出端口桩（M5b Task 5）：App E2E 装配的 pickSavePath 记录导出路径；
    // writeImage 记录图片字节长度（exportedBytes > 0 断言）
    savePaths: [] as string[],
    exportedBytes: null as number | null,
    // 导入文件桩：默认返回 md 内置样例（含 1 个忽略块「忽略段。」）；M21 起支持
    // xmind 用例覆写 __zenE2e.pickImportStub（返回 PickedImport 或 null）
    async pickImportFile(): Promise<PickedImport | null> {
      const stub = (this as unknown as { pickImportStub?: PickedImport | null }).pickImportStub
      if (stub !== undefined) return stub
      return { name: '外部图', kind: 'md', text: '# 外部图\n\n忽略段。\n\n## A\n' }
    },
    // 读剪贴板图桩（粘贴截图「粘贴」按钮路径）：默认固定 1×1 PNG（同选图桩字节），
    // 名字与生产同构走 pasteImageName 时间戳；空剪贴板用例直接覆写整个函数为 async () => null
    async readClipboardImage(): Promise<{ name: string; bytes: Uint8Array } | null> {
      return { name: pasteImageName('png'), bytes: harnessPngBytes() }
    },
    // 选图桩（M19 插图）：固定 1×1 透明 PNG 字节（IHDR 宽高 1×1，尺寸解析链路真实可跑）
    async pickImageFile(): Promise<{ name: string; bytes: Uint8Array } | null> {
      return { name: '选图.png', bytes: harnessPngBytes() }
    },
    // 目录选择桩（M5d Task 6 开屏/更换工作区用）：固定返回 /ws，App E2E 分支读取
    async pickDirectory(): Promise<string | null> {
      return '/ws'
    },
  }
  if (new URLSearchParams(window.location.search).has('desk')) {
    await fs.mkdir('/ws/项目')
    await fs.writeTextFileAtomic('/ws/项目/项目图.md', '# 项目图\n')
    await fs.writeTextFileAtomic('/ws/根图.md', '# 根图\n')
  }
  // 引导预设（2026-09 onboarding tour）：引导遮罩全屏拦截交互，既有用例（?e2e=1）
  // 启动即满足触发条件会被挡住——故无 ?tour 参数时默认预写 tourDone:true（既有用例
  // 零改动豁免）；仅 ?tour=1 显式要看引导时写 false（tour.spec 全流程/跳过/重看用）。
  // ?tourdone=1（tour.spec「完成后重启」用例）与默认等效，仅作 spec 内语义自述。
  // 预写须先于 setWorkspace：它是 load-merge-save，会保留 tourDone
  const tourDone = !new URLSearchParams(window.location.search).has('tour')
  await fs.writeTextFileAtomic('/cfg.json', JSON.stringify({ workspaceDir: null, tourDone }))
  if (!new URLSearchParams(window.location.search).has('nows')) {
    await useAppStore.getState().setWorkspace('/ws')
  }
}
