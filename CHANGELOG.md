# Changelog

所有重要的变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 新增设置页面，可视化配置内置 LLM 和三个后端（Resolve Studio / Spring Harness / Resolve Harness）
- 新增调试模式开关，控制是否展示私有配置（launchers.local.json / prompts.local.json）
- 新增投资周报快捷方式（打开最新模型目录下最新的 markdown 周报）
- 新增投资分析快捷方式（用 Numbers 打开最新的投资收益率分析 CSV）
- 新增番茄钟功能（25 分钟工作 / 5 分钟休息，声音 + 系统通知提醒，每日完成计数）
- 新增系统监控（CPU / 内存 / 硬盘 / 网络 IP，实时刷新）
- 新增全局热键（Cmd+Option+D 显示/隐藏窗口）
- 新增托盘菜单（后端状态、快捷打开、设置、窗口列表）
- 新增迷你横条（最小化时显示番茄钟倒计时 + H/S/R/🤖 快捷打开 + CPU/内存监控）
- 新增剪贴板历史功能
- 新增对话历史持久化
- 新增内置 LLM 支持（OpenAI 兼容 API，作为三个后端都不可用时的 fallback）

### Changed
- 项目改名：desktop-kit → Sprite（桌面精灵）
- 界面标题：HUD → ESN → Sprite
- 应用 identifier：cn.erishen.desktop-kit → cn.erishen.sprite
- 配置文件路径：~/Library/Application Support/cn.erishen.desktop-kit/ → ~/Library/Application Support/cn.erishen.sprite/
- 番茄钟 localStorage 键名：desktop-kit-pomodoro → sprite-pomodoro（自动迁移旧数据）
- 日志前缀：[desktop-kit] → [sprite]
- 内置 LLM 系统提示词角色名：desktop-kit 桌面助手 → Sprite 桌面助手
- 子窗口配置：不透明、可调整大小、支持拖动/最小化/全屏/关闭
- 全屏实现：铺满当前显示器（setSize + setPosition），而非原生全屏（避免 macOS 独占 Space + 透明黑屏问题）
- 快捷方式配置：公开/私密分离（launchers.public.json 可提交，launchers.local.json gitignore）
- 提示词模板配置：公开/私密分离（prompts.public.json 可提交，prompts.local.json gitignore）

### Fixed
- 修复子窗口拖动/最小化/全屏/关闭按钮不生效的问题（capabilities 添加 builtin-* / settings-* 窗口权限）
- 修复番茄钟最小化后重置的问题（localStorage 持久化）
- 修复硬盘容量显示与 macOS 系统不一致的问题（改用 df -H，1000 进制）
- 修复 resolve-harness 后端日志刷屏的问题
- 修复 Rust 编译 mismatched ABI 问题（禁用 sccache + Makefile 自动删除 .dylib 宏库文件）
- 修复子窗口遮挡母窗口的问题（子窗口与母窗口水平对齐，同类型上下错开）
- 修复重复打开同类型窗口的问题（每种类型最多 3 个窗口）
- 修复子窗口超出屏幕边缘的问题（自动调整位置）
- 修复输入框出现竖向滚动条的问题
- 修复内置 LLM 请求 URL 重复拼接 /v1/v1/chat/completions 的问题
- 修复内置 LLM 输出乱码的问题（添加系统提示词，参考 resolve-studio 的做法）

### Removed
- 移除时钟窗口
- 移除屏幕教练功能
- 移除鼠标跟随功能
- 移除书钉功能
- 移除⚡内嵌 resolve 快捷方式（与树叶/加号重复）

### Security
- .env 文件不提交（含 API Key / Token）
- launchers.local.json / prompts.local.json 不提交（个人私密配置）
- 调试模式默认关闭，私有配置默认隐藏

## [0.1.0] - 2026-09-01

### Added
- 初始版本发布
- Tauri v2 + React + TypeScript 桌面悬浮助手
- 四个聊天子窗口（Resolve Studio / Spring Harness / Resolve Harness / 内置 LLM）
- 系统监控（CPU / 内存）
- 快捷方式（网页 / 本地应用 / 脚本）
- 透明毛玻璃主窗口
- 托盘图标

[Unreleased]: https://github.com/erishen/sprite/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/erishen/sprite/releases/tag/v0.1.0
