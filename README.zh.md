# Sprite

> **Tauri v2 + React + TypeScript 桌面助手** — 一个悬浮在桌面上的小精灵，集成系统监控、番茄钟、快捷启动和多 AI 后端聊天。

`Sprite` 是一个轻量级桌面悬浮组件：基于 Tauri v2 构建，前端使用 Vite + React + TypeScript，后端使用 Rust 运行在原生壳中。

[English](README.md) | 中文

## 功能特性

一个悬浮在桌面上的**桌面精灵**（系统监控、番茄钟、快捷链接、聊天面板）：

- **系统监控** — CPU 使用率、内存、磁盘占用（macOS `df -H`，1000 进制，与 Finder 显示一致）、网络信息（本地 IP + 公网 IP，5 分钟缓存），每 3 秒通过 Rust `system_stats` 命令（`sysinfo`）轮询；负载升高时进度条变黄/变红
- **番茄钟** — 25 分钟工作 / 5 分钟休息（可通过 ⚙ 设置自定义），声音 + 系统通知提醒，自动切换下一阶段，每日完成计数，localStorage 持久化
- **快捷启动** — 三类按钮分组：常用网页 / 本地应用 / 快捷操作：在默认浏览器中打开 URL、通过 bundle ID 启动本地应用（`open -b`）、或在后台运行 shell 单行命令。通过 JSON 文件配置：`src/config/launchers.public.json`（可提交）+ `src/config/launchers.local.json`（gitignore，私密）
- **聊天面板** — 四种悬浮聊天窗口（H/S/R/🤖），每种最多 3 个窗口：
  - **H** — Resolve Harness（`http://127.0.0.1:8899`）
  - **S** — Spring Harness（`http://127.0.0.1:8080`）
  - **R** — Resolve Studio（`http://127.0.0.1:8787`）
  - **🤖** — 内置 LLM（OpenAI 兼容 API，通过设置页面或 `.env` 配置）
  每个面板支持流式 Markdown、工具调用状态、多轮上下文、对话历史持久化、剪贴板历史、提示词模板
- **设置页面** — 可视化配置所有 AI 后端和内置 LLM（头部 ⚙ 按钮或托盘菜单）；配置保存到本地 JSON，为空时回退到 `.env`
- **全局热键** — `Cmd+Option+D` 显示/隐藏精灵
- **托盘菜单** — 后端状态、快捷打开聊天面板、设置、窗口列表、显示/退出
- **迷你横条** — 最小化时显示番茄钟倒计时（或秒钟）+ H/S/R/🤖 快捷打开 + CPU/内存监控 + 还原/隐藏
- **可拖动** — 拖动卡片任意非交互区域即可移动组件；窗口自动适配卡片大小，启动时停靠在右上角
- **全屏 ⛶** — 切换窗口铺满当前显示器（`setSize` 到显示器尺寸 + `setPosition(0,0)`，非原生全屏：macOS 原生全屏会独占一个 Space，且全屏+透明是已知黑屏组合）。内容放大居中；全屏时暂停自动适配/拖动；再次点击 ⛶ 还原之前的窗口大小
- **安全与隐私** — 多层敏感数据保护：
  - **HTTPS 强制验证** — URL 验证，包含 HTTPS 检查、localhost/内网检测，对不安全 URL 显示视觉警告
  - **应用锁屏** — 密码保护的锁屏界面，支持空闲自动锁定，可通过托盘菜单访问
  - **密码箱主密码** — 密码箱可选主密码保护，访问存储的凭据前需要身份验证
  - **系统钥匙串存储** — 可选 macOS Keychain 集成，将 API Key 存储在系统安全存储中而非本地配置文件
  - **加密密码存储** — 使用 AES-GCM 加密和 PBKDF2 密钥派生存储密码
- **聊天记录导出** — 所有四种聊天面板类型都支持将对话历史导出为 Markdown 或 JSON 文件
- **快捷方式搜索** — 支持搜索所有快捷方式（网页链接、本地应用、脚本），关键词高亮，按 ESC 清除
- **可自定义全局热键** — 可在设置中配置显示/隐藏热键（默认：`Cmd+Option+D`），保存后自动重新注册
- **增强托盘菜单** — 托盘菜单显示系统资源使用率（CPU/内存/磁盘），并提供快速锁定选项
- **多显示器支持** — 聊天面板和设置窗口跟随主窗口到当前显示器，确保跨显示器时位置一致

## 窗口模式

窗口是一个**透明、无边框、始终置顶的组件**，悬浮在正常桌面之上（见 `src-tauri/tauri.conf.json` + `src/App.tsx` 中的适配逻辑）：

- `fullscreen: false` — **不要**对悬浮组件使用原生全屏：在 macOS 上它会独占自己的 Space（把其他窗口都推开，看起来像应用"霸占"了屏幕），且全屏+透明是已知的黑屏组合。紧凑的始终置顶窗口才是桌面组件的正确形态。
- 启动时，Rust 将窗口停在主显示器右上角，然后前端测量卡片大小并调用 `setSize`，使透明窗口精确包裹内容（没有不可见的点击阻挡区域）。拖动卡片任意位置即可移动。
- `macOSPrivateApi: true`（+ `macos-private-api` cargo 特性）是 macOS 上透明窗口的必要条件。
- `decorations: false` 表示没有标题栏 — 通过 ✕ 按钮隐藏（托盘：*显示* / *退出*），或在开发终端按 `Ctrl+C`。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 壳 | [Tauri v2](https://v2.tauri.app/)（Rust，edition 2021） |
| 前端 | React 19 + TypeScript + Vite 7 |
| IPC | `@tauri-apps/api` `invoke()` → `#[tauri::command]` |
| 启动 | `launch` 命令（std::process，分离式 spawn） |
| 监控 | `sysinfo`（CPU + 内存 + 磁盘） |
| Resolve 桥接 | `resolve.rs` — reqwest SSE 代理 → tauri `Channel` → React |
| 包管理器 | pnpm |

## 快速开始

```bash
pnpm install          # 安装前端依赖（Tauri CLI 作为 devDependency）
pnpm run tauri dev    # 启动应用，支持热重载（vite 在 :1420 + Rust）
```

生产构建：

```bash
pnpm run tauri build  # 打包平台安装包（如 macOS 的 .app / .dmg）
```

## 项目结构

```
sprite/
├── src/                 # React + TypeScript 前端（Vite）
│   ├── main.tsx         # 入口
│   ├── App.tsx          # 桌面精灵 UI（监控 / 番茄钟 / 链接 / 聊天 / 拖动）
│   ├── components/      # 可复用组件（HudHeader、MiniBar、SettingsPanel 等）
│   └── assets/
├── src-tauri/           # Rust 后端（实际的 Tauri crate）
│   ├── src/
│   │   ├── main.rs      # 精简入口，调用 lib run()
│   │   ├── lib.rs       # system_stats + 启动命令、托盘图标、设置
│   │   ├── settings.rs  # 设置加载/保存（本地 JSON）
│   │   ├── panel.rs     # 悬浮聊天面板窗口管理
│   │   ├── history.rs   # 对话历史持久化
│   │   └── builtin.rs   # 内置 LLM 客户端（OpenAI 兼容）
│   ├── Cargo.toml       # crate 清单（workspace 成员）
│   ├── tauri.conf.json  # 应用配置：窗口、打包、frontendDist
│   ├── capabilities/    # 权限范围（default.json）
│   └── icons/
├── public/              # Vite 服务的静态资源
├── index.html
├── package.json         # pnpm 脚本：dev / build / tauri
├── .env.example         # 环境变量模板（复制为 .env）
├── README.md            # 英文文档
├── README.zh.md         # 中文文档
└── vite.config.ts
```

## 常用命令

```bash
make dev         # pnpm run tauri dev — 运行桌面应用，支持热重载
make build       # pnpm run tauri build — 生成发布包
make fe-build    # 仅构建前端（tsc && vite build → dist/）
make check       # cargo check — 验证 Rust 编译（需要 dist/ 存在）
make clean       # 删除 node_modules、dist 和 src-tauri/target
make test        # 运行前端测试（vitest）
```

## 配置

### 设置页面（推荐）

点击头部的 ⚙ 按钮或托盘菜单中的"⚙ 设置"打开可视化设置页面。所有 AI 后端配置都可以在那里设置，并立即生效。

### 环境变量（回退）

将 `.env.example` 复制为 `.env` 并填入你的值：

```bash
cp .env.example .env
```

所有可用选项见 `.env.example`。设置页面中的值优先于 `.env`。

## 添加功能

- **新增 Rust 命令** — 在 `src-tauri/src/lib.rs` 中添加 `#[tauri::command] fn my_cmd(...)` 并在 `invoke_handler` 中注册；前端用 `invoke("my_cmd", { ... })` 调用。
- **编辑快捷启动** — 编辑 `src/config/launchers.public.json`（公开）或 `src/config/launchers.local.json`（私密，gitignore）：
  ```json
  { "kind": "url",    "label": "GitHub", "url": "https://github.com" }
  { "kind": "app",    "label": "终端",   "app": "Terminal" }
  { "kind": "script", "label": "发布博客", "command": "~/bin/publish-blog.sh" }
  ```
  脚本以分离模式运行，stdio 为 null；要实时查看长任务，请用终端包裹，例如 `command: "open -a Terminal ~/bin/task.sh"`。
- **窗口 / 托盘行为** — 窗口标志在 `src-tauri/tauri.conf.json` 中；托盘图标 + 菜单在 `src-tauri/src/lib.rs` 的 `setup` 钩子中构建。从 JS 隐藏/显示窗口需要 `src-tauri/capabilities/default.json` 中的 `core:window:allow-hide` / `allow-show` 权限。
- **新增前端页面** — 在 `src/` 下添加组件并从 `App.tsx` 路由。

## 相关项目

- [resolve-studio](https://github.com/erishen/resolve-studio) — Cordis agent 运行时，支持工具调用 + 沙箱
- [spring-harness](https://github.com/erishen/spring-harness) — Spring AI Agent，ReAct 推理
- [resolve-harness](https://github.com/erishen/resolve-harness) — 同步问答 + 工具 trace

属于 `work/rust` workspace 的一部分（photo-library、markdown-library、video-library、rag-task-service、resolve-tui）。

## 下载与发布

### 下载渠道
- **GitHub Releases**: https://github.com/erishen/sprite/releases
- **个人网站**: https://erishen.cn/sprite

### 校验和验证
每个 Release 都提供 SHA256 校验和，下载后请验证文件完整性：

```bash
# macOS
shasum -a 256 Sprite_*.dmg

# Windows (PowerShell)
Get-FileHash .\Sprite_*.exe -Algorithm SHA256

# Linux
sha256sum Sprite_*.AppImage
```

### macOS 打开未公证应用
由于未缴纳苹果开发者账号费用，应用未经过公证。首次打开时可能提示"无法打开"：

1. 右键点击应用，选择"打开"
2. 在弹出的对话框中再次点击"打开"
3. 或者在终端执行：`xattr -cr /Applications/Sprite.app`

## 隐私政策

**本应用尊重并保护用户隐私：**

- ✅ **不收集任何用户数据** — 所有数据均存储在本地
- ✅ **不上传任何信息** — 不发送遥测、统计或崩溃报告
- ✅ **对话历史本地存储** — 聊天记录保存在本地 JSON 文件中
- ✅ **剪贴板历史本地存储** — 仅在本地保存，不上传
- ✅ **AI 请求由用户配置** — API Key 由用户自行配置，请求直接发送至对应 AI 服务商
- ✅ **开源透明** — 所有代码开源，任何人都可以审计

**数据存储位置：**
- macOS: `~/Library/Application Support/cn.erishen.sprite/`
- Windows: `%APPDATA%\cn.erishen.sprite\`
- Linux: `~/.local/share/cn.erishen.sprite/`

## 免责声明

本软件按"现状"提供，不提供任何明示或暗示的担保，包括但不限于对适销性、特定用途适用性和非侵权性的担保。

在任何情况下，作者或版权持有人均不对因使用本软件或与本软件相关的任何行为而产生的任何索赔、损害或其他责任负责，无论是合同诉讼、侵权诉讼还是其他形式。

**使用本软件即表示您同意自行承担使用风险。**

## 开源协议

本项目采用 **MIT License** 开源协议。

### 第三方依赖
本项目使用了以下开源软件，在此表示感谢：

| 软件 | 协议 |
|------|------|
| Tauri | MIT / Apache-2.0 |
| React | MIT |
| TypeScript | Apache-2.0 |
| Vite | MIT |
| Rust | MIT / Apache-2.0 |
| sysinfo | MIT |
| reqwest | MIT / Apache-2.0 |
| serde | MIT / Apache-2.0 |

完整的依赖列表请见 `Cargo.toml` 和 `package.json`。

## 作者

- **GitHub**: [@erishen](https://github.com/erishen)
- **个人网站**: [erishen.cn](https://erishen.cn)
- **X (Twitter)**: [@erishen](https://x.com/erishen)
- **LinkedIn**: [erishen](https://www.linkedin.com/in/erishen/)

## 贡献

欢迎提交 Issue 和 Pull Request！

如果你觉得这个项目有用，欢迎给个 ⭐ Star 支持一下。
