#!/usr/bin/env bash
# 复现 / 验证：macOS runner 上 `npm run tauri build` 的
#   FATAL ERROR: Ineffective mark-compacts near heap limit
#   Allocation failed - JavaScript heap out of memory
#
# 结论（2026-10-03 实测，本机 16GB / node 22.22.2）：
#   V8 老生代上限是按物理内存自动推导的 —— 本机 16GB 得 4144MB，
#   而 GitHub 的 macos-latest 只有 7GB，上限仅约 2048MB。
#   本项目 vite/rollup 展开 monaco-editor + antd 的模块图，堆峰值 2048~2560MB，
#   于是只有 macOS 打包会 OOM（ubuntu / windows runner 均为 16GB，默认 4144MB，能过）。
#
# 用法：
#   bash .repro/vite-oom-repro.sh 2048   # 预期：OOM（复现）
#   bash .repro/vite-oom-repro.sh 4096   # 预期：成功（验证修复值）
#
# 注意：跑之前请先手动 `rm -rf dist`（超过 50 个文件时沙箱会拦批量删除）。

set -u
LIMIT="${1:-2048}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 环境 ==="
node --version 2>/dev/null || echo "node: (未在 PATH 中，请用绝对路径)"
node -e "console.log('默认 heap_size_limit MB =', Math.round(require('v8').getHeapStatistics().heap_size_limit/1024/1024))" 2>/dev/null

echo
echo "=== 以 --max-old-space-size=${LIMIT} 执行 vite build ==="
NODE_OPTIONS="--max-old-space-size=${LIMIT}" npm run build:only 2>&1 | tail -12
CODE="${PIPESTATUS[0]}"

echo
if [ "$CODE" -ne 0 ]; then
  echo "RESULT: OOM 复现成立（退出码 ${CODE}）—— heap 上限 ${LIMIT}MB 不足以支撑本次打包"
else
  echo "RESULT: 构建成功（退出码 0）—— ${LIMIT}MB 足够"
fi
