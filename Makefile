SHELL := /bin/bash

.PHONY: help dev build check clean clean-macros fe-install fe-build test typecheck lint release

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

dev: ## 启动桌面应用（先彻底清理残留实例，再 vite 热更新 + Rust 编译，打开窗口）
	@echo "[kill-dev] 彻底清理残留 sprite / cargo / rustc / vite 进程..."
	@pkill -f 'target/debug/sprite' 2>/dev/null || true
	@pkill -f 'cargo.*run' 2>/dev/null || true
	@pkill -f 'cargo.*build' 2>/dev/null || true
	@pkill -f 'cargo.*check' 2>/dev/null || true
	@pkill -f 'rustc' 2>/dev/null || true
	@pkill -f 'vite' 2>/dev/null || true
	@# 清理占用 1420 端口的进程（vite dev server）
	@if lsof -ti:1420 > /dev/null 2>&1; then \
		echo "[kill-dev] 清理占用 1420 端口的进程..."; \
		lsof -ti:1420 | xargs kill -9 2>/dev/null || true; \
	fi
	@sleep 2
	@# 二次检查：如果还有 cargo/rustc 进程，再等一下并强制杀掉
	@if pgrep -f 'cargo|rustc' > /dev/null 2>&1; then \
		echo "[kill-dev] 仍有残留进程，再次强制清理..."; \
		pkill -9 -f 'cargo|rustc' 2>/dev/null || true; \
		sleep 1; \
	fi
	@echo "[kill-dev] 清理完成，启动开发服务器..."
	@# 注意：不自动删除宏库 .dylib 文件，提高编译速度
	@# 如遇 mismatched ABI 问题，手动运行: make clean-macros
	@# 启用 sccache 编译缓存（提高重复编译速度）
	npm run tauri dev

build: ## 构建 release 安装包
	npm run tauri build

fe-install: ## 安装前端依赖
	npm install

fe-build: ## 仅构建前端产物（tsc + vite → dist/）
	npm run build

test: ## 运行前端单元测试（vitest）
	npm test

check: ## Rust 编译检查（需先有 frontend dist/，否则 tauri 嵌入资源会失败）
	cd src-tauri && cargo check

clean: ## 清理前端产物与依赖
	rm -rf node_modules dist src-tauri/target

clean-macros: ## 删除共享 target 中所有宏库 .dylib 文件（解决 mismatched ABI 问题，cargo 会自动重新编译）
	@echo "删除共享 target 中所有宏库 .dylib 文件..."
	rm -f ../target/debug/deps/*.dylib
	@echo "完成。下次 make dev 时 cargo 会自动重新编译宏库。"

typecheck: ## TypeScript 类型检查
	npx tsc --noEmit

lint: ## 代码检查（TypeScript 类型 + Rust 编译检查）
	@echo "=== TypeScript 类型检查 ==="
	npx tsc --noEmit
	@echo "=== Rust 编译检查 ==="
	cd src-tauri && cargo check

release: ## 发布构建（先类型检查，再构建 release 安装包）
	@echo "=== TypeScript 类型检查 ==="
	npx tsc --noEmit
	@echo "=== 构建 release 安装包 ==="
	npm run tauri build