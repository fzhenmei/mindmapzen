// src/skills/weread/manifest.ts —— 微信读书 skill 清单(spec §2):文档原样拷贝自
// Tencent/WeChatReading 仓库 skills/ 目录(?raw 原文导入,上游升级 = 覆盖文件 + 同步
// skillVersion;frontmatter version 与 skillVersion 的一致性由 index.test.ts 钉住)。
import SKILL from './docs/SKILL.md?raw'
import book from './docs/book.md?raw'
import discover from './docs/discover.md?raw'
import notes from './docs/notes.md?raw'
import profile from './docs/profile.md?raw'
import readdata from './docs/readdata.md?raw'
import review from './docs/review.md?raw'
import search from './docs/search.md?raw'
import shelf from './docs/shelf.md?raw'
import type { SkillManifest } from '../types'

const wereadManifest: SkillManifest = {
  id: 'weread',
  name: '微信读书',
  description: '搜索书籍、查看书架与笔记划线、浏览书评、阅读统计与推荐',
  keyHelpUrl: 'https://weread.qq.com/r/weread-skills',
  examples: ['看看我的书架', '我这个月读了多久书', '把《三体》的笔记划线整理成导图'],
  gatewayUrl: 'https://i.weread.qq.com/api/agent/gateway',
  skillVersion: '1.0.4',
  instructions: SKILL,
  docs: { book, discover, notes, profile, readdata, review, search, shelf },
}
export default wereadManifest
