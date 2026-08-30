import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'

interface Props {
  /** 创建工作区入口（主按钮）与「选择已有文件夹」（次链接）语义同一：
   *  都弹目录选择框——「创建工作区」即「选一个文件夹作为工作区」（现 pickDirectory 流） */
  onCreateWorkspace(): void
}

/** 首次开屏页（M5d spec §2 → M14 spec §4 官方 authentication 模式）：
 *  全屏 grid 居中 + Card w-96 解剖（居中卡头：印标/CardTitle/CardDescription，
 *  主钮 size=lg 通栏在 CardContent，次钮 ghost 在 CardFooter）；
 *  命令栏在此态隐藏（由 LibraryView 控制） */
export default function WelcomeScreen({ onCreateWorkspace }: Readonly<Props>) {
  return (
    <div
      className="grid min-h-screen flex-1 place-items-center"
      data-testid="welcome-screen"
    >
      <Card className="w-96">
        <CardHeader className="text-center">
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" className="mx-auto">
            <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--destructive)" />
            <path
              d="M17 25l5 5 10-12"
              stroke="var(--background)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
            创建工作区
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
          <Button
            type="button"
            variant="ghost"
            data-testid="btn-welcome-pick"
            onClick={onCreateWorkspace}
          >
            选择已有文件夹
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
