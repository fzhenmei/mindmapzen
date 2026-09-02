// src/services/nativePath.ts —— 面向用户的路径出口分隔符归一（2026-09 修复）
// 背景：内部路径统一以 joinPath 的 '/' 拼接（Windows 文件 API 兼容），但工作区目录
// 来自系统对话框时是原生 '\' 形态，拼出的 mdPath 两者混用（C:\ws\测试/a.md）。
// 文件读写不受影响，仅「复制路径」等给人看/给 AI 用的出口需要归一：
// Windows 上全 '\'（资源管理器/命令行直接可用），其他平台 '/' 即原生，原样返回。
// 注：复制 md 里的图片绝对路径（absolutizeImagePaths）是有意的全 '/' 设计，不经此处。

/** 运行平台检测（userAgentData 新标准优先，回退 navigator.platform 字符串） */
const detectWindows = (): boolean => {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ''
  return platform.toLowerCase().includes('win')
}

/** 路径分隔符归一为平台原生形态：Windows '/'→'\'，其他平台原样。
 *  isWindows 参数供测试注入（默认运行时检测）。 */
export function toNativePath(p: string, isWindows: boolean = detectWindows()): string {
  return isWindows ? p.replaceAll('/', '\\') : p
}
