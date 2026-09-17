#!/usr/bin/env bash
# Sprite 对外发布构建：生成不含本地私有配置的 DMG。
# 与 CI（release.yml）保持一致：构建前将 local 配置清空并移除种子数据，
# 构建完成后无论成败都自动恢复，不影响本地开发。
#
# 用法:
#   scripts/build-public.sh

set -euo pipefail

# 脚本所在目录 -> 项目根
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_LAUNCHERS="$ROOT/src/config/launchers.local.json"
LOCAL_PROMPTS="$ROOT/src/config/prompts.local.json"
RESOURCES="$ROOT/src-tauri/resources"
BACKUP="$(mktemp -d)"
trap restore EXIT

restore() {
  # 恢复 local 配置与种子数据（原始文件不存在则跳过）
  [ -f "$BACKUP/launchers.local.json" ] && cp -pf "$BACKUP/launchers.local.json" "$LOCAL_LAUNCHERS" 2>/dev/null || true
  [ -f "$BACKUP/prompts.local.json" ] && cp -pf "$BACKUP/prompts.local.json" "$LOCAL_PROMPTS" 2>/dev/null || true
  if [ -d "$BACKUP/seeds" ]; then
    cp -pf "$BACKUP/seeds/"*.json "$RESOURCES/" 2>/dev/null || true
  fi
}

# 备份需要临时清空的内容
cp -pf "$LOCAL_LAUNCHERS" "$BACKUP/" 2>/dev/null || true
cp -pf "$LOCAL_PROMPTS" "$BACKUP/" 2>/dev/null || true
mkdir -p "$BACKUP/seeds"
cp -pf "$RESOURCES"/*.json "$BACKUP/seeds/" 2>/dev/null || true

# 清空 private 配置 + 种子数据（README.md 保留，保证 resources glob 有匹配）
echo "[]" > "$LOCAL_LAUNCHERS"
echo "[]" > "$LOCAL_PROMPTS"
rm -f "$RESOURCES"/*.json

echo "[build-public] 开始构建对外发布版（不含 local 配置与种子数据）..."
cd "$ROOT"
pnpm run tauri build
echo "[build-public] 构建完成，已自动恢复本地配置。"