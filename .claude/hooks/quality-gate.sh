#!/usr/bin/env bash
# 完成工作质量门(Stop hook):回合结束时若工作区有未提交变更,强制跑
# eslint + tsc typecheck + guard:lines;任一失败即阻塞回合并把输出反馈给
# Claude 修复——质量检查不依赖自觉。Sonar 无命令行,其警告由 IDE SonarLint
# 经 PostToolUse 的 ide_diagnostics 注入,报告前须一并核对。
set -u
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# 防死循环:被 block 后的续跑(stop_hook_active)不再拦
input=$(cat)
case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
esac

# 无未提交变更(纯对话/已全部提交)直接放行
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

fail() {
  echo "质量门未通过($1),修复后才能结束回合:" >&2
  echo "$2" >&2
  exit 2
}

lint_out=$(npm run --silent lint 2>&1) || fail "eslint" "$lint_out"
type_out=$(npm run --silent typecheck 2>&1) || fail "tsc typecheck" "$type_out"
guard_out=$(npm run --silent guard:lines 2>&1) || fail "guard:lines" "$guard_out"

echo '{"systemMessage":"质量门通过:eslint + tsc + guard:lines"}'
