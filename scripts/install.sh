#!/usr/bin/env bash
# Sprite macOS 安装脚本
# 把构建产物 Sprite.app 安装到应用目录，并清除隔离属性（未签名应用才能打开）。
#
# 用法:
#   scripts/install.sh             # 从 bundle/macos 安装到 /Applications（系统级，默认）
#   scripts/install.sh --dmg       # 从 bundle/dmg 挂载安装（验证 DMG 完整性后安装）
#   多个参数可组合: --dmg --yes
#   可选: SPRITE_DMG=/path/to.dmg  指定 DMG 路径

set -euo pipefail

# 脚本所在目录 -> 项目根
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Sprite"
BASE_BUNDLE="$ROOT/target/release/bundle"
APP_DIR_SRC="$BASE_BUNDLE/macos/$APP_NAME.app"
# 装到系统级 /Applications
APPS_DIR="/Applications"
# 全局挂载点：供 EXIT trap 清理用。函数局部变量在 set -u + 函数返回后会失效，
# 导致 trap 清理时报 "unbound variable"。
MOUNT_POINT=""

# 选择当前运行架构对应的 DMG（tauri 产物按架构命名）
pick_dmg() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    arm64) echo "$BASE_BUNDLE/dmg/${APP_NAME}_"*_aarch64.dmg ;;
    x86_64) echo "$BASE_BUNDLE/dmg/${APP_NAME}_"*_x64.dmg ;;
    *) echo "无法识别的架构: $arch" >&2; exit 1 ;;
  esac
}

install_app() {
  local src="$1"
  local dest_dir="$APPS_DIR"
  mkdir -p "$dest_dir"
  # 系统级 /Applications 通常受保护；当前用户非 root 且不可写时提示用 sudo。
  if [ "$dest_dir" = "/Applications" ] && [ "$(id -u)" -ne 0 ] && ! touch "$dest_dir/.write-test" 2>/dev/null; then
    echo "注意: /Applications 受系统保护，需要管理员权限。" >&2
    echo "请用 sudo 运行:" >&2
    echo "  sudo scripts/install.sh" >&2
    exit 1
  fi
  [ -f "$dest_dir/.write-test" ] && rm -f "$dest_dir/.write-test"
  echo "[install] 复制 $src -> $dest_dir"
  if [ -d "$dest_dir/$APP_NAME.app" ]; then
    echo "[install] 已存在旧版本，先移除..."
    rm -rf "$dest_dir/$APP_NAME.app"
  fi
  cp -R "$src" "$dest_dir/"
  echo "[install] 清除隔离属性（未签名应用）..."
  xattr -cr "$dest_dir/$APP_NAME.app" 2>/dev/null || true
  echo "[install] 完成: $dest_dir/$APP_NAME.app"
}

install_from_app() {
  if [ ! -d "$APP_DIR_SRC" ]; then
    echo "错误: 未找到 $APP_DIR_SRC" >&2
    echo "请先运行: pnpm run tauri build" >&2
    exit 1
  fi
  install_app "$APP_DIR_SRC"
}

install_from_dmg() {
  local dmg
  dmg="${SPRITE_DMG:-$(pick_dmg | head -1)}"
  if [ ! -f "$dmg" ]; then
    echo "错误: 未找到 DMG: $dmg" >&2
    echo "请先运行: pnpm run tauri build" >&2
    exit 1
  fi
  echo "[install] 验证 DMG 完整性: $dmg"
  hdiutil verify "$dmg" >/dev/null 2>&1 || { echo "错误: DMG 校验失败" >&2; exit 1; }
  MOUNT_POINT="/Volumes/$APP_NAME"
  umount "$MOUNT_POINT" 2>/dev/null || true
  echo "[install] 挂载 DMG..."
  hdiutil attach "$dmg" -nobrowse -mountpoint "$MOUNT_POINT"
  trap '[ -n "$MOUNT_POINT" ] && hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true' EXIT
  install_app "$MOUNT_POINT/$APP_NAME.app"
}

find_running() {
  # 检测运行中的实例（覆盖安装前必须停止，否则旧进程可能占住文件句柄或装完仍在跑旧版）
  # 匹配：已安装实例（/Applications 与 ~/Applications 两种位置）+ 开发/构建残留
  local pids
  pids="$(pgrep -f 'Sprite.app/Contents/MacOS/sprite' || true)"
  [ -n "$pids" ] || pids="$(pgrep -f 'target/debug/sprite' || true)"
  [ -n "$pids" ] || pids="$(pgrep -f 'target/release/sprite' || true)"
  echo "${pids:-}"
}

stop_running() {
  local pids="$1"
  echo "[install] 停止运行中的实例 (pid: ${pids})..."
  kill $pids 2>/dev/null || true
  sleep 1
}

main() {
  local use_dmg=0 use_yes=0
  for arg in "$@"; do
    case "$arg" in
      --dmg) use_dmg=1 ;;
      --yes) use_yes=1 ;;
      --help|-h) echo "用法: $0 [--dmg] [--yes]  (默认安装到 /Applications)"; exit 0 ;;
      *) echo "未知参数: $arg (可用: --dmg, --yes)" >&2; exit 1 ;;
    esac
  done

  # 运行实例检查：有实例时询问（--yes 自动停止），拒绝则取消安装
  local pids
  pids="$(find_running)"
  if [ -n "$pids" ]; then
    if [ "$use_yes" = 1 ]; then
      stop_running "$pids"
    else
      printf "[install] 检测到运行中的实例 (pid: %s)。停止后继续安装？[y/N] " "$pids"
      read -r ans || true
      case "$ans" in y|Y|yes|YES) stop_running "$pids" ;; *) echo "已取消。"; exit 1 ;; esac
    fi
  else
    echo "[install] 无运行中的实例"
  fi

  if [ "$use_dmg" = 1 ]; then
    install_from_dmg
  else
    install_from_app
  fi
}

main "$@"