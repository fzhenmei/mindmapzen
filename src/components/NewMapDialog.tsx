import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { listTemplates, type TemplateInfo } from '../services/templates'
import { readDirTree, type DirNode } from '../services/desk'
import { useAppStore } from '../store/appStore'

/** 根目录的 Select 哨兵值（2026-09 目录选择）：Radix Select 不接受空串 value；':' 属
 *  目录名非法字符（INVALID），与任何真实 relDir（'/' 分隔路径）永不冲突 */
const ROOT_VALUE = ':'

/** 目录树扁平化选项：depth 驱动下拉选项缩进（层级可视化） */
interface DirOption { path: string; name: string; depth: number }
const flattenDirTree = (nodes: readonly DirNode[], depth: number): DirOption[] =>
  nodes.flatMap((n) => [{ path: n.path, name: n.name, depth }, ...flattenDirTree(n.children, depth + 1)])

interface Props {
  onCancel(): void
  /** 确认（M16 抛错语义）：resolve = 成功（调用方在成功路径上关框）；抛错 = 对话框
   *  就地显示 error.message、不关框——输入类错误不再散落到全局 banner。
   *  relDir（2026-09 目录选择）= 框内「保存位置」当前选中目录（''=工作区根） */
  onConfirm(name: string, templateContent?: string, relDir?: string): void | Promise<void>
  /** 初始目录（2026-09 目录选择）：undefined = 常驻入口（页首/欢迎页/画布）——回退上次
   *  选择；'' = 树根右键「在此新建」（显式根，不被上次选择覆盖）；'a/b' = 树右键目标目录。
   *  非空时标题沿用 titleIn（在「X」新建导图）；候选目录已删则宽容回退根 */
  initialDir?: string
}

/** 新建导图对话框（M16）：名称输入 + 保存位置选择 + 模板选择（ui Select，内置 + 工作区
 *  templates/）。testid 沿用 NameDialog 契约（input-name/btn-confirm）——既有 E2E 新建流
 *  零适配（默认空白模板，直接输名称回车 = v1.5.0 行为）。模板与目录清单挂载时各拉取一次；
 *  目录选项渲染与选择交互由 E2E 覆盖（Radix Select 选项仅打开后渲染，jsdom 驱动不开） */
export default function NewMapDialog({ onCancel, onConfirm, initialDir }: Readonly<Props>) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [templates, setTemplates] = useState<readonly TemplateInfo[]>([])
  const [picked, setPicked] = useState<string>('builtin:blank')
  const [dirs, setDirs] = useState<readonly DirOption[]>([])
  // 初值同步计算（开框即定，不等树）：initialDir（undefined=常驻入口）→ 上次选择 → 根。
  //  竞态安全：目录树未返回时输名回车，落盘目录仍是开框语义（标题/右键目标一致）
  const [dir, setDir] = useState(initialDir !== undefined ? initialDir : useAppStore.getState().lastNewMapDir)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await listTemplates(useAppStore.getState().adapter, useAppStore.getState().workspaceDir)
      if (!cancelled) setTemplates(list)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 目录清单（2026-09 目录选择）：挂载拉取一次；读到后对同步初值做存在性校验——
  // 目录已删/换工作区残留才降级根（宽容降级，不阻断创建）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let opts: DirOption[] = []
      try {
        opts = flattenDirTree(await readDirTree(useAppStore.getState().adapter, useAppStore.getState().workspaceDir!), 0)
      } catch (e) {
        // 显式出口（不吞异常）：目录树读失败仅降级「保存位置」为根，不阻断新建主流程
        console.error('读取工作区目录树失败，保存位置降级为根目录', e)
      }
      if (cancelled) return
      setDirs(opts)
      setDir((cur) => (cur !== '' && !opts.some((o) => o.path === cur) ? '' : cur))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const confirm = async () => {
    setError(null)
    if (name.trim() === '') {
      setError(t('errors.nameEmpty'))
      return
    }
    const tpl = templates.find((tpl) => tpl.key === picked)
    // 空白模板走 createMap 缺省路径（与旧行为同一落盘内容）
    const content = tpl !== undefined && tpl.key !== 'builtin:blank' ? tpl.content : undefined
    try {
      await onConfirm(name.trim(), content, dir)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const title = initialDir ? t('library.dialogs.newMap.titleIn', { dir: initialDir }) : t('library.dialogs.newMap.title')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <Input
          data-testid="input-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirm()
          }}
          autoFocus
        />
        {error !== null && (
          <p data-testid="dialog-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Select value={dir === '' ? ROOT_VALUE : dir} onValueChange={(v) => setDir(v === ROOT_VALUE ? '' : v)}>
          <SelectTrigger data-testid="dir-select" aria-label={t('library.dialogs.newMap.dirSelect')} className="w-full">
            <SelectValue placeholder={t('library.dialogs.newMap.dirSelect')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROOT_VALUE}>{t('library.dialogs.newMap.rootDir')}</SelectItem>
            {dirs.map((o) => (
              <SelectItem key={o.path} value={o.path}>
                {'  '.repeat(o.depth) + o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger data-testid="template-select" aria-label={t('library.dialogs.newMap.templateSelect')} className="w-full">
            <SelectValue placeholder={t('library.dialogs.newMap.templateSelect')} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((tpl) => (
              <SelectItem key={tpl.key} value={tpl.key}>
                {tpl.name}
                {tpl.desc !== '' && <span className="ml-2 text-xs text-muted-foreground">{tpl.desc}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="btn-confirm" onClick={() => void confirm()}>
            {t('library.dialogs.newMap.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
