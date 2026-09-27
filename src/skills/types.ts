// src/skills/types.ts —— skill manifest 自描述类型(spec §4.1):系统层只认此接口,
// 所有 per-skill 素材(名称/示例/官网链接/指令文档)住进 skill 包,零 UI 特化。
export interface SkillManifest {
  /** 稳定 id:工具参数 skill 的 enum 值、凭据槽键(config.json skills.<id>) */
  id: string
  /** 显示名(设置面板/引导消息) */
  name: string
  /** 一句话能力描述(设置面板) */
  description: string
  /** 获取凭据的官方页面(设置面板链接) */
  keyHelpUrl: string
  /** 模板问题(引导消息;skill 作者最清楚该怎么展示) */
  examples: readonly string[]
  /** 网关地址(AI 不接触 URL,永远来自此处) */
  gatewayUrl: string
  /** 上游 skill 版本:handler 自动注入 skill_version,不依赖 AI 记得 */
  skillVersion: string
  /** SKILL.md 主指令原文(注入 system prompt) */
  instructions: string
  /** 能力参考文档名(不含 .md)→ 原文(skill_read_doc 按需读) */
  docs: Record<string, string>
}
