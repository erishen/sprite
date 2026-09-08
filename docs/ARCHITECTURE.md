# Sprite 架构文档

> Sprite（原 desktop-kit）是一个基于 Tauri v2 + React 的桌面悬浮助手应用，提供多后端 LLM 聊天、系统监控、番茄时钟、剪贴板历史、密码箱等功能。

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 技术栈](#2-技术栈)
- [3. 整体架构](#3-整体架构)
- [4. 前端架构](#4-前端架构)
- [5. 后端架构（Rust）](#5-后端架构rust)
- [6. 核心模块说明](#6-核心模块说明)
- [7. 数据流](#7-数据流)
- [8. 窗口管理](#8-窗口管理)
- [9. 配置管理](#9-配置管理)
- [10. 安全与隐私](#10-安全与隐私)
- [11. 构建和部署](#11-构建和部署)

---

## 1. 项目概述

### 1.1 项目定位

Sprite 是一个轻量级的桌面悬浮助手，核心功能包括：

- **多后端 LLM 聊天**：支持 Resolve Studio、Spring Harness、Resolve Harness、内置 LLM 四种后端
- **系统资源监控**：CPU、内存、磁盘、网络实时监控
- **番茄时钟**：专注计时，支持自定义工作/休息时长
- **剪贴板历史**：记录剪贴板内容，支持搜索和敏感信息过滤
- **密码箱**：本地加密存储敏感信息，支持主密码保护
- **快捷方式**：快速启动本地应用、脚本、URL
- **应用锁屏**：超时自动锁定，保护隐私
- **全局热键**：自定义快捷键快速唤起应用

### 1.2 设计原则

- **轻量高效**：基于 Tauri，使用系统 WebView，内存占用低
- **隐私优先**：敏感信息本地存储，API Key 使用系统钥匙串
- **可扩展**：模块化设计，支持多种 LLM 后端
- **用户体验**：悬浮窗口设计，不干扰正常工作

---

## 2. 技术栈

### 2.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 6.x | 构建工具 |
| Tauri API | 2.x | 与 Rust 后端通信 |
| Vitest | 2.x | 单元测试 |

### 2.2 后端（Rust）

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.11.x | 桌面应用框架 |
| tokio | 1.x | 异步运行时 |
| reqwest | 0.12.x | HTTP 客户端 |
| serde / serde_json | 1.x | 序列化/反序列化 |
| sysinfo | 0.35.x | 系统信息采集 |
| tauri-plugin-global-shortcut | 2.x | 全局热键 |
| tauri-plugin-clipboard-manager | 2.x | 剪贴板管理 |
| tauri-plugin-opener | 2.x | 打开外部链接/文件 |

### 2.3 开发工具

| 工具 | 用途 |
|------|------|
| make | 构建脚本管理 |
| cargo | Rust 包管理 |
| npm | 前端包管理 |
| rust-analyzer | Rust IDE 支持 |

---

## 3. 整体架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  主窗口   │ │ Resolve  │ │ Spring   │ │ Harness  │ ... │
│  │  (HUD)   │ │ Studio   │ │ Harness  │ │          │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       │              │              │              │           │
│       └──────────────┴──────┬───────┴──────────────┘         │
│                               │                                 │
│                    Tauri IPC (invoke / event)                  │
│                               │                                 │
├───────────────────────────────┼─────────────────────────────────┤
│                               │                                 │
│  ┌────────────────────────────▼─────────────────────────────┐  │
│  │                    Rust 后端层                              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │ 命令层   │ │ 窗口管理 │ │ 系统监控 │ │ 托盘菜单 │      │  │
│  │  │(commands)│ │ (panel) │ │ (stats) │ │ (tray)  │      │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │ 后端对接 │ │ 钥匙串   │ │ 热键管理 │ │ 文件导出 │      │  │
│  │  │(resolve) │ │(keychain)│ │(hotkey) │ │(export) │      │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                               │                                 │
├───────────────────────────────┼─────────────────────────────────┤
│                               │                                 │
│  ┌────────────────────────────▼─────────────────────────────┐  │
│  │                    外部服务层                              │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │  │
│  │  │Resolve Studio│ │Spring Harness│ │Resolve Harness│    │  │
│  │  │  (HTTP API)  │ │  (HTTP API)  │ │  (HTTP API)  │    │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘    │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │  │
│  │  │  系统钥匙串   │ │  本地文件系统 │ │  系统信息     │    │  │
│  │  │  (Keychain)  │ │  (File System)│ │  (sysinfo)   │    │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 架构分层

1. **用户界面层**：React 组件，负责 UI 渲染和用户交互
2. **Tauri IPC 层**：前端与 Rust 后端的通信桥梁，使用 `invoke` 调用命令，使用 `event` 监听事件
3. **Rust 后端层**：核心业务逻辑，包括窗口管理、系统监控、后端对接等
4. **外部服务层**：外部 LLM 后端 API、系统服务（钥匙串、文件系统等）

---

## 4. 前端架构

### 4.1 目录结构

```
src/
├── App.tsx                    # 主应用入口，窗口布局和状态管理
├── App.css                    # 全局样式
├── main.tsx                   # React 入口
├── vite-env.d.ts              # Vite 类型声明
│
├── ResolvePanel.tsx           # Resolve Studio 聊天窗口
├── SpringPanel.tsx            # Spring Harness 聊天窗口
├── HarnessPanel.tsx           # Resolve Harness 聊天窗口
├── BuiltinPanel.tsx           # 内置 LLM 聊天窗口
│
├── useFullscreen.ts           # 全屏功能 hook
├── useMinimize.ts             # 最小化功能 hook
│
├── components/                 # 可复用组件
│   ├── ChatHeader.tsx         # 聊天窗口标题栏
│   ├── ChatInput.tsx          # 聊天输入框
│   ├── ChatMiniBar.tsx        # 最小化状态横条
│   ├── ClipboardHistory.tsx   # 剪贴板历史弹窗
│   ├── CustomItemsManager.tsx # 密码箱管理界面
│   ├── CustomItemsQuickAccess.tsx # 密码箱快速访问
│   ├── ExampleChips.tsx       # 示例问题标签
│   ├── HudHeader.tsx          # 主窗口标题栏
│   ├── HudLinks.tsx           # 快捷方式列表
│   ├── LockScreen.tsx         # 锁屏界面
│   ├── MiniBar.tsx            # 主窗口最小化横条
│   ├── PomodoroTimer.tsx      # 番茄时钟组件
│   ├── PromptTemplates.tsx    # 提示词模板
│   ├── RichText.tsx           # 富文本渲染
│   ├── SettingsPanel.tsx      # 设置面板
│   └── Toast.tsx              # Toast 提示
│
├── hooks/                      # 自定义 hooks
│   ├── useBackends.ts         # 后端服务状态
│   ├── useChatHistory.ts      # 聊天历史
│   ├── useChatInput.ts        # 聊天输入状态
│   ├── useClipboardHistory.ts # 剪贴板历史
│   ├── useCustomItems.ts      # 密码箱
│   ├── useDebugMode.ts        # 调试模式
│   ├── useDragWindow.ts       # 窗口拖动
│   ├── useExampleQuestions.ts # 示例问题
│   ├── useFlash.ts            # 闪烁动画
│   ├── useHistory.ts          # 历史记录
│   ├── usePomodoro.ts         # 番茄时钟
│   ├── usePrompts.ts          # 提示词模板
│   ├── useSettings.ts         # 设置管理
│   ├── useSystemStats.ts      # 系统资源监控
│   ├── useToast.ts            # Toast 提示
│   └── useWindowResize.ts     # 窗口大小调整
│
├── utils/                      # 工具函数
│   ├── chatExport.ts          # 聊天记录导出
│   ├── chatUtils.ts           # 聊天工具函数
│   ├── crypto.ts              # 加密/解密
│   ├── dataManagement.ts      # 数据导出/删除
│   ├── keychain.ts            # 钥匙串操作
│   ├── logger.ts              # 日志脱敏
│   ├── mergedConfig.ts        # 配置合并（环境变量 + 设置）
│   ├── reminder.ts            # 提醒功能
│   ├── urlValidator.ts        # URL 验证
│   ├── windowUtils.ts         # 窗口工具函数
│   └── __tests__/             # 单元测试
│
├── types/                      # 类型定义
│   └── chat.ts                # 聊天相关类型
│
└── __tests__/                  # 集成测试
```

### 4.2 状态管理

前端使用 React Hooks 进行状态管理，主要包括：

- **`useSettings`**：全局设置状态，持久化到本地文件
- **`useSystemStats`**：系统资源监控状态，每秒刷新
- **`usePomodoro`**：番茄时钟状态
- **`useClipboardHistory`**：剪贴板历史状态
- **`useCustomItems`**：密码箱状态，加密存储在 localStorage
- **`useToast`**：全局 Toast 提示状态

### 4.3 窗口布局

前端根据当前窗口类型渲染不同的布局：

- **主窗口（main）**：HUD 界面，包含系统监控、快捷方式、番茄时钟等
- **聊天窗口（resolve-*/spring-*/harness-*/builtin-*）**：聊天界面，包含消息列表、输入框、标题栏
- **设置窗口（settings-*）**：设置面板

窗口类型通过 URL 查询参数或窗口 label 区分。

---

## 5. 后端架构（Rust）

### 5.1 目录结构

```
src-tauri/src/
├── main.rs                    # 应用入口
├── lib.rs                     # 库入口，注册命令和插件
│
├── builtin.rs                 # 内置 LLM 后端对接
├── resolve_studio.rs          # Resolve Studio 后端对接
├── spring_harness.rs          # Spring Harness 后端对接
├── harness.rs                 # Resolve Harness 后端对接
├── resolve.rs                 # 通用后端请求工具
│
├── panel.rs                   # 窗口管理（创建/关闭子窗口）
├── tray.rs                    # 托盘菜单
├── hotkey.rs                  # 全局热键管理
│
├── system_stats.rs            # 系统资源监控
├── launcher.rs                # 本地应用/脚本启动
├── keychain.rs                # 系统钥匙串操作
├── settings.rs                # 设置管理（加载/保存）
├── history.rs                 # 聊天历史管理
├── export.rs                  # 文件导出
└── resize.rs                  # 窗口大小调整
```

### 5.2 命令层（Commands）

Rust 后端通过 `#[tauri::command]` 宏暴露命令给前端调用，主要包括：

#### 系统监控
- `system_stats()`：获取 CPU、内存、磁盘、网络使用情况

#### 窗口管理
- `open_panel(kind, x, y)`：打开指定类型的子窗口
- `close_panel(label)`：关闭指定窗口
- `open_settings()`：打开设置窗口
- `begin_resize(direction)`：开始调整窗口大小

#### 后端对接
- `resolve_chat(base, message, thread_id)`：Resolve Studio 聊天
- `resolve_chat_abort(base, thread_id)`：中止 Resolve Studio 聊天
- `resolve_approve(base, thread_id, call_id, action)`：审批工具调用
- `resolve_tool_run(base, tool_name, args)`：运行工具
- `resolve_file(base, path)`：读取文件
- `spring_chat(base, model, message)`：Spring Harness 聊天
- `spring_models(base)`：获取 Spring Harness 模型列表
- `spring_info(base)`：获取 Spring Harness 信息
- `harness_chat(base, token, message, thread_id)`：Resolve Harness 聊天
- `harness_health(base, token)`：检查 Resolve Harness 健康状态
- `harness_models(base, token)`：获取 Resolve Harness 模型列表
- `harness_approve(base, token, thread_id, call_id, action)`：审批工具调用
- `fetch_examples(base, token, mode)`：获取示例问题
- `builtin_chat(base_url, api_key, model, message)`：内置 LLM 聊天
- `builtin_chat_abort(base_url, thread_id)`：中止内置 LLM 聊天

#### 安全与隐私
- `keychain_save(account, password)`：保存到钥匙串
- `keychain_get(account)`：从钥匙串获取
- `keychain_delete(account)`：从钥匙串删除
- `keychain_available()`：检查钥匙串是否可用

#### 设置与历史
- `load_settings()`：加载设置
- `save_settings(settings)`：保存设置
- `load_history(label)`：加载聊天历史
- `save_history(label, history)`：保存聊天历史

#### 其他
- `launch(app_or_url)`：启动本地应用或打开 URL
- `save_export_file(file_name, content)`：保存导出文件到下载目录
- `register_toggle_hotkey(hotkey)`：注册切换热键
- `unregister_all_hotkeys()`：注销所有热键

### 5.3 事件系统

Rust 后端通过事件向前端推送通知，主要包括：

- `settings-updated`：设置更新通知
- `lock-screen`：锁屏通知
- `system-stats-updated`：系统资源更新（可选）

---

## 6. 核心模块说明

### 6.1 窗口管理（panel.rs）

窗口管理模块负责创建和管理子窗口，主要功能：

- **窗口类型**：支持 4 种聊天窗口类型（resolve、spring、harness、builtin）和设置窗口
- **窗口定位**：子窗口默认在母窗口所在显示器打开，同类型窗口上下错开、左右重叠
- **窗口限制**：每种类型最多 3 个窗口，避免窗口过多
- **窗口状态**：支持最小化、全屏、关闭、拖动

### 6.2 后端对接（resolve.rs / resolve_studio.rs / spring_harness.rs / harness.rs / builtin.rs）

后端对接模块负责与各种 LLM 后端通信，主要功能：

- **统一接口**：所有后端都提供类似的聊天、中止、审批接口
- **流式响应**：支持 SSE（Server-Sent Events）流式响应
- **工具调用审批**：支持工具调用的人工审批流程
- **健康检查**：定期检查后端服务健康状态

### 6.3 系统监控（system_stats.rs）

系统监控模块负责采集系统资源使用情况，主要功能：

- **CPU 使用率**：总体和各核心使用率
- **内存使用**：已用/总量、交换空间
- **磁盘使用**：各分区已用/总量
- **网络流量**：上传/下载速度

### 6.4 钥匙串管理（keychain.rs）

钥匙串管理模块负责与 macOS 系统钥匙串交互，主要功能：

- **保存密码**：将 API Key 等敏感信息保存到系统钥匙串
- **获取密码**：从系统钥匙串获取敏感信息
- **删除密码**：从系统钥匙串删除敏感信息
- **可用性检查**：检查钥匙串是否可用

实现方式：通过调用 macOS `security` 命令行工具访问钥匙串。

### 6.5 加密工具（crypto.ts）

加密工具模块负责密码箱的加密/解密，主要功能：

- **随机密钥生成**：生成随机加密密钥（未启用主密码时）
- **主密码派生**：使用 PBKDF2 从主密码派生加密密钥
- **AES-GCM 加密**：使用 AES-GCM 算法加密敏感信息
- **批量重加密**：更换密钥时批量重新加密所有数据

---

## 7. 数据流

### 7.1 聊天消息流

```
用户输入
    │
    ▼
ChatInput 组件
    │
    │  invoke("xxx_chat", ...)
    ▼
Rust 后端命令
    │
    │  HTTP 请求（SSE 流式）
    ▼
LLM 后端服务
    │
    │  流式响应
    ▼
Rust 后端命令
    │
    │  invoke 返回（流式）
    ▼
前端 Panel 组件
    │
    │  更新消息列表
    ▼
RichText 组件渲染
```

### 7.2 设置数据流

```
用户修改设置
    │
    ▼
SettingsPanel 组件
    │
    │  invoke("save_settings", ...)
    ▼
Rust 后端 settings.rs
    │
    │  写入 ~/Library/Application Support/cn.erishen.sprite/settings.json
    ▼
文件系统
    │
    │  emit("settings-updated")
    ▼
前端 useSettings hook
    │
    │  更新全局状态
    ▼
各组件响应设置变化
```

### 7.3 系统监控数据流

```
Rust 后端 system_stats.rs
    │
    │  sysinfo 采集系统信息
    ▼
系统信息
    │
    │  invoke("system_stats") （前端每秒轮询）
    ▼
前端 useSystemStats hook
    │
    │  更新监控数据
    ▼
HudHeader / 托盘菜单显示
```

---

## 8. 窗口管理

### 8.1 窗口类型

| 窗口类型 | Label 前缀 | 默认尺寸 | 用途 |
|---------|-----------|---------|------|
| 主窗口 | `main` | 可变 | HUD 界面，系统监控、快捷方式等 |
| Resolve Studio | `resolve-*` | 440x700 | Resolve Studio 聊天 |
| Spring Harness | `spring-*` | 440x700 | Spring Harness 聊天 |
| Resolve Harness | `harness-*` | 440x700 | Resolve Harness 聊天 |
| 内置 LLM | `builtin-*` | 440x700 | 内置 LLM 聊天 |
| 设置 | `settings-*` | 480x640 | 设置面板 |

### 8.2 窗口特性

- **透明窗口**：聊天窗口使用透明背景 + CSS 圆角（设置窗口已改为直角不透明）
- **无边框**：所有窗口都使用自定义标题栏，无系统边框
- **置顶显示**：子窗口默认置顶，不被其他窗口遮挡
- **不可调整大小**：子窗口和设置窗口不可调整大小（主窗口可通过左侧边缘调整宽度）
- **多显示器支持**：子窗口跟随母窗口所在显示器打开

### 8.3 窗口状态

每个窗口支持以下状态：

- **正常状态**：完整显示聊天界面
- **最小化状态**：显示为横条，只保留标题和基本操作
- **全屏状态**：占满整个屏幕，隐藏标题栏（可通过快捷键还原）

---

## 9. 配置管理

### 9.1 配置层级

配置按以下优先级合并（高优先级覆盖低优先级）：

1. **用户设置**（`settings.json`）：用户在设置界面配置的选项
2. **环境变量**（`.env`）：开发环境配置，以 `VITE_` 开头
3. **默认值**：代码中定义的默认配置

### 9.2 环境变量

| 变量名 | 用途 | 默认值 |
|--------|------|--------|
| `VITE_RESOLVE_BASE` | Resolve Studio 后端地址 | `http://127.0.0.1:8000` |
| `VITE_SPRING_BASE` | Spring Harness 后端地址 | `http://127.0.0.1:8001` |
| `VITE_HARNESS_BASE` | Resolve Harness 后端地址 | `http://127.0.0.1:8002` |
| `VITE_HARNESS_API_TOKEN` | Resolve Harness API Token | 空 |
| `VITE_LLM_BASE_URL` | 内置 LLM 基础 URL | 空 |
| `VITE_LLM_API_KEY` | 内置 LLM API Key | 空 |
| `VITE_LLM_MODEL` | 内置 LLM 模型名 | 空 |

### 9.3 用户设置

用户设置保存在 `~/Library/Application Support/cn.erishen.sprite/settings.json`，主要包括：

- **外观设置**：应用标题、调试模式、私有内容显示开关
- **后端配置**：各后端的地址、API Key、模型选择
- **功能开关**：番茄时钟、系统监控、剪贴板历史
- **安全设置**：锁屏密码、自动锁定时间、主密码
- **热键配置**：全局切换热键

---

## 10. 安全与隐私

### 10.1 敏感信息存储

| 信息类型 | 存储方式 | 加密 |
|---------|---------|------|
| API Key | 系统钥匙串（Keychain） | 系统级加密 |
| 密码箱内容 | localStorage | AES-GCM 加密 |
| 密码箱密钥 | localStorage（随机密钥）或主密码派生 | - |
| 锁屏密码 | settings.json | 明文（仅本地） |
| 聊天历史 | 本地 JSON 文件 | 明文（仅本地） |
| 设置 | 本地 JSON 文件 | 明文（仅本地） |

### 10.2 日志脱敏

应用对控制台日志进行自动脱敏，过滤以下敏感信息：

- API Key / Token / Secret / Password
- GitHub Token（ghp_, gho_, ghu_, ghs_, ghr_）
- JWT Token
- Bearer Token
- 信用卡号
- 手机号
- 邮箱
- 身份证号
- 银行卡号
- URL 中的查询参数

### 10.3 剪贴板敏感信息过滤

剪贴板历史自动过滤以下敏感信息，不记录到历史中：

- API Key / Token / Secret / Password
- GitHub Token
- JWT Token
- 信用卡号
- 手机号
- 邮箱
- 身份证号
- 银行卡号
- 私钥（BEGIN PRIVATE KEY）
- AWS 访问密钥

### 10.4 网络安全

- **HTTPS 强制验证**：非 localhost 的 HTTP URL 显示警告，防止敏感信息明文传输
- **内网 IP 温和提示**：内网 IP 地址显示温和提示，不强制阻止
- **CORS 限制**：Tauri 应用默认只能访问配置的域名

---

## 11. 构建和部署

### 11.1 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器（自动热重载）
make dev
# 或
npm run tauri dev
```

### 11.2 生产构建

```bash
# 构建生产版本
make build
# 或
npm run tauri build

# 构建产物位置
# src-tauri/target/release/bundle/
#   ├── dmg/sprite_0.1.0_x64.dmg
#   └── macos/sprite.app
```

### 11.3 测试

```bash
# 运行前端单元测试
npm test

# 运行 Rust 测试
cd src-tauri && cargo test
```

### 11.4 发布流程

1. 更新 `CHANGELOG.md`
2. 更新版本号（`package.json` 和 `src-tauri/Cargo.toml`）
3. 运行 `RELEASE_CHECKLIST.md` 中的检查项
4. 构建生产版本
5. 上传到 GitHub Releases 或 erishen.cn

---

## 附录

### A. 相关项目

- [resolve-studio](https://github.com/erishen/resolve-studio)：Resolve Studio 后端服务
- [spring-harness](https://github.com/erishen/spring-harness)：Spring Harness 后端服务
- [resolve-harness](https://github.com/erishen/resolve-harness)：Resolve Harness 后端服务

### B. 参考文档

- [Tauri v2 官方文档](https://v2.tauri.app/)
- [React 官方文档](https://react.dev/)
- [Rust 官方文档](https://doc.rust-lang.org/)

---

**最后更新**：2026-09-08
