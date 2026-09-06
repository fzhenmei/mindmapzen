import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import AppLogo from './AppLogo'

interface Props {
  /** 唯一入口：弹目录选择框——选中文件夹即定为工作区（pickDirectory 流） */
  onCreateWorkspace(): void
}

/** 首次开屏页（M5d spec §2 → M14 spec §4 官方 authentication 模式 → M14b 区块化）：
 *  官方 authentication 的 muted 底 + 自上而下轻渐变（from-background to-muted，
 *  起点同底色无缝），白卡 + 官方 shadow-sm 浮于其上——分区靠色场不靠线条；
 *  Card w-96 解剖（居中卡头：印标/CardTitle/CardDescription，主钮 size=lg 通栏在
 *  CardContent）；命令栏在此态隐藏（由 LibraryView 控制）。
 *  2026-09 UI 评审 P2-1：原双入口（创建工作区/选择已有文件夹）措辞不同但同一动作
 *  （都弹目录选择框），制造「创建会新建文件夹」的错误预期与无谓选择——合并为
 *  单主钮「选择工作区文件夹」，所见即所选 */
export default function WelcomeScreen({ onCreateWorkspace }: Readonly<Props>) {
  return (
    <div
      className="grid min-h-screen flex-1 place-items-center bg-linear-to-b from-background to-muted"
      data-testid="welcome-screen"
    >
      <Card className="w-96">
        <CardHeader className="text-center">
          <AppLogo size={48} className="mx-auto" />
          <CardTitle className="text-2xl font-semibold tracking-tight">Mind Map Zen</CardTitle>
          <CardDescription>想法落成 .md</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            size="lg"
            className="w-full"
            data-testid="btn-welcome-create"
            onClick={onCreateWorkspace}
          >
            选择工作区文件夹
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
