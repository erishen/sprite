# 贡献指南

感谢你对 Sprite 项目的兴趣！我们欢迎任何形式的贡献，包括但不限于：

- 🐛 提交 Bug 报告
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复或新功能
- 🌐 帮助翻译

## 开发环境准备

### 前置要求

- **Node.js** >= 22.0.0（推荐 24 LTS，使用 [nvm](https://github.com/nvm-sh/nvm) 管理版本）
- **pnpm** >= 9.0.0
- **Rust** >= 1.75.0（通过 [rustup](https://rustup.rs/) 安装）
- **macOS** 12+（当前主要支持 macOS，Windows/Linux 待验证）

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/erishen/sprite.git
cd sprite

# 安装前端依赖
pnpm install
```

### 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填入你的配置（API Key、后端地址等）
```

## 常用命令

```bash
make help          # 显示所有可用命令
make dev           # 启动开发服务器（vite 热更新 + Rust 编译）
make build         # 构建 release 安装包
make typecheck     # TypeScript 类型检查
make lint          # 代码检查（TypeScript + Rust）
make test          # 运行前端单元测试
make fe-build      # 仅构建前端产物
make check         # Rust 编译检查
make clean         # 清理构建产物
make clean-macros  # 清理宏库缓存（解决 mismatched ABI 问题）
```

## 项目结构

```
sprite/
├── src/                          # React + TypeScript 前端
│   ├── components/               # 可复用组件
│   │   ├── HudHeader.tsx        # 顶部标题栏（H/S/R/🤖 按钮 + 设置）
│   │   ├── HudLinks.tsx         # 快捷方式网格
│   │   ├── MiniBar.tsx          # 最小化横条
│   │   ├── PomodoroTimer.tsx    # 番茄钟组件
│   │   ├── SettingsPanel.tsx    # 设置窗口
│   │   ├── useDebugMode.ts      # 调试模式 hook
│   │   ├── usePomodoro.ts       # 番茄钟状态管理
│   │   ├── usePrompts.ts        # 提示词模板加载
│   │   ├── useSettings.ts       # 设置管理
│   │   └── useSystemStats.ts    # 系统监控
│   ├── config/                   # 配置文件
│   │   ├── launchers.public.json  # 公开快捷方式（可提交）
│   │   ├── launchers.local.json   # 私密快捷方式（gitignore）
│   │   ├── prompts.public.json    # 公开提示词（可提交）
│   │   └── prompts.local.json     # 私密提示词（gitignore）
│   ├── App.tsx                   # 主应用组件
│   └── main.tsx                  # 入口文件
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # 主逻辑（系统监控、托盘、热键）
│   │   ├── builtin.rs            # 内置 LLM 客户端
│   │   ├── history.rs            # 对话历史持久化
│   │   ├── panel.rs              # 子窗口管理
│   │   ├── resolve.rs            # Resolve 后端桥接（SSE 代理）
│   │   └── settings.rs           # 设置管理
│   ├── capabilities/             # 权限配置
│   ├── icons/                    # 应用图标
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
├── website/                      # 下载页面
├── .github/workflows/            # GitHub Actions
├── Makefile                      # 构建脚本
├── package.json                  # 前端依赖
├── .env.example                  # 环境变量模板
├── README.md                     # 英文文档
├── README.zh.md                  # 中文文档
├── CHANGELOG.md                  # 变更日志
└── CONTRIBUTING.md               # 本文件
```

## 代码规范

### Git 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type 类型：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（既不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具/依赖相关

**示例：**
```
feat(pomodoro): 添加番茄钟每日完成计数

- 完成一个工作周期后自动计数
- 每日零点自动重置
- 数据持久化到 localStorage

Closes #123
```

### 分支策略

- `main`: 主分支，保持稳定
- `feat/xxx`: 新功能分支
- `fix/xxx`: Bug 修复分支
- `docs/xxx`: 文档更新分支

### 代码风格

- **TypeScript**: 使用严格模式，避免 `any`
- **Rust**: 遵循 Rust 官方风格，运行 `cargo fmt`
- **CSS**: 使用 BEM 命名规范
- **注释**: 复杂逻辑必须有注释，公共 API 必须有文档注释

## 提交 Pull Request

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交你的修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 开启一个 Pull Request

### PR 检查清单

提交 PR 前请确认：

- [ ] 代码通过类型检查 (`make typecheck`)
- [ ] 代码通过编译检查 (`make lint`)
- [ ] 没有引入新的警告
- [ ] 已更新相关文档（README / CHANGELOG）
- [ ] 已添加必要的测试（如适用）
- [ ] 提交信息遵循 Conventional Commits 规范

## 报告 Bug

提交 Bug 报告时请包含：

1. **Bug 描述**: 清晰简洁地描述问题
2. **复现步骤**: 如何复现这个 Bug
3. **预期行为**: 你期望发生什么
4. **实际行为**: 实际发生了什么
5. **环境信息**:
   - 操作系统版本
   - Sprite 版本
   - Rust / Node 版本
6. **截图/日志**: 如有，请附上截图或日志

## 功能建议

提出新功能建议时请包含：

1. **功能描述**: 清晰简洁地描述你想要的功能
2. **使用场景**: 这个功能解决什么问题
3. **实现思路**: 你有什么实现想法（可选）
4. **替代方案**: 你考虑过哪些替代方案（可选）

## 相关项目

- [resolve-studio](https://github.com/erishen/resolve-studio) — Cordis agent 运行时
- [spring-harness](https://github.com/erishen/spring-harness) — Spring AI Agent
- [resolve-harness](https://github.com/erishen/resolve-harness) — 同步问答 + 工具 trace

## 许可证

通过贡献代码，你同意你的贡献将根据项目的 [MIT 许可证](LICENSE) 进行许可。

---

再次感谢你的贡献！🎉
