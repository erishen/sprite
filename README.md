# Sprite

> **Tauri v2 + React + TypeScript desktop assistant** — a floating desktop sprite with system monitor, pomodoro timer, quick launchers, and multi-AI chat panels.

`Sprite` is a lightweight desktop floating widget: a Tauri v2 app whose UI is a Vite + React + TypeScript frontend and whose backend is Rust running inside the native shell.

## What it does

A floating **desktop sprite** (system monitor, pomodoro timer, quick links, chat panels) that overlays the desktop:

- **System monitor** — CPU %, memory, disk usage (macOS `df -H`, 1000-base, matches Finder), and network (local IP + public IP with 5-min cache), polled every 3s from a Rust `system_stats` command (`sysinfo`); bars turn amber/red as load rises
- **Pomodoro timer** — 25-min work / 5-min break (customizable via ⚙ settings), sound + system notification reminders, auto-advance, daily completed count, localStorage persistence
- **Quick launchers** — three kinds of buttons grouped as 常用网页 / 本地应用 / 快捷操作: open URLs in the default browser, launch local apps by bundle ID (`open -b`), or run shell one-liners in the background. Configured via JSON files: `src/config/launchers.public.json` (committable) + `src/config/launchers.local.json` (gitignored, private)
- **Chat panels** — four types of floating chat windows (H/S/R/🤖), each max 3 windows:
  - **H** — Resolve Harness (`http://127.0.0.1:8899`)
  - **S** — Spring Harness (`http://127.0.0.1:8080`)
  - **R** — Resolve Studio (`http://127.0.0.1:8787`)
  - **🤖** — Built-in LLM (OpenAI-compatible API, configured via settings page or `.env`)
  Each panel supports streaming markdown, tool-call status, multi-turn context, conversation history persistence, clipboard history, and prompt templates
- **Settings page** — visual configuration UI for all AI backends and built-in LLM (⚙ button in header or tray menu); configs saved to local JSON, falls back to `.env`
- **Global hotkey** — `Cmd+Option+D` to show/hide the sprite
- **Tray menu** — backend status, quick-open chat panels, settings, window list, Show / Quit
- **Mini bar** — when minimized, shows pomodoro countdown (or seconds) + H/S/R/🤖 quick-open + CPU/memory stats + restore/hide
- **Draggable** — drag anywhere on the card (non-interactive areas) to move the widget; the window auto-sizes to the card and anchors top-right on launch
- **Fullscreen ⛶** — toggles the window to fill the current display (`setSize` to monitor size + `setPosition(0,0)`, not native fullscreen: macOS native fullscreen takes over its own Space and fullscreen + transparency is a known black-screen combo). Content scales up and centers; auto-fit/drag are suspended while fullscreen; click ⛶ again to restore the previous frame
- **Security & Privacy** — multiple layers of protection for sensitive data:
  - **HTTPS enforcement** — URL validation with HTTPS checks, localhost/intranet detection, and visual warnings for insecure URLs
  - **App lock screen** — password-protected lock screen with auto-lock after idle time, accessible via tray menu
  - **Password vault master password** — optional master password for the password vault, requiring authentication before accessing stored credentials
  - **System Keychain storage** — optional macOS Keychain integration for API keys, storing sensitive credentials in the system secure storage instead of local config files
  - **Encrypted password storage** — AES-GCM encryption with PBKDF2 key derivation for stored passwords
- **Chat export** — export conversation history as Markdown or JSON files for all four chat panel types
- **Quick launcher search** — search across all quick launchers (web links, local apps, scripts) with keyword highlighting and ESC to clear
- **Customizable global hotkey** — configure the show/hide hotkey in settings (default: `Cmd+Option+D`), with automatic re-registration on save
- **Enhanced tray menu** — system resource usage display (CPU/memory/disk) in the tray menu, plus quick lock option
- **Multi-monitor support** — chat panels and settings window follow the main window to the current display, ensuring consistent placement across monitors

## Window mode

The window is a **transparent, frameless, always-on-top widget** that floats over your normal desktop (see `src-tauri/tauri.conf.json` + the fit logic in `src/App.tsx`):

- `fullscreen: false` — **do not** use native fullscreen for an overlay: on macOS it takes over its own Space (pushes every other window away, looks like the app "captured" the screen) and fullscreen + transparency is a known black-screen combo there. A compact always-on-top window is the correct shape for a desktop widget.
- On start, Rust parks the window at the top-right of the primary monitor, then the frontend measures the card and calls `setSize` so the transparent window hugs the content exactly (no invisible click-blocking areas). Drag anywhere on the card to move it.
- `macOSPrivateApi: true` (+ the `macos-private-api` cargo feature) is required for transparency on macOS.
- `decorations: false` means no title bar — hide via the ✕ button (tray: *Show* / *Quit*), or `Ctrl+C` in the dev terminal.

## Stack

| Layer | Tech |
| --- | --- |
| Shell | [Tauri v2](https://v2.tauri.app/) (Rust, edition 2021) |
| Frontend | React 19 + TypeScript + Vite 7 |
| IPC | `@tauri-apps/api` `invoke()` → `#[tauri::command]` |
| Launch | `launch` command (std::process, detached spawn) |
| Monitor | `sysinfo` (CPU + memory + disk) |
| Resolve bridge | `resolve.rs` — reqwest SSE proxy → tauri `Channel` → React |
| Package manager | npm |

## Quick start

```bash
npm install          # install frontend deps (Tauri CLI comes as devDependency)
npm run tauri dev    # launch the app with hot-reload (vite on :1420 + Rust)
```

Production build:

```bash
npm run tauri build  # bundles the platform installer (e.g. .app / .dmg on macOS)
```

## Project structure

```
sprite/
├── src/                      # React + TypeScript frontend (Vite)
│   ├── main.tsx              # entry
│   ├── App.tsx               # desktop sprite UI (monitor / pomodoro / links / chat / drag)
│   ├── ResolvePanel.tsx      # Resolve Studio chat panel
│   ├── SpringPanel.tsx       # Spring Harness chat panel
│   ├── HarnessPanel.tsx      # Resolve Harness chat panel
│   ├── BuiltinPanel.tsx      # Built-in LLM chat panel
│   ├── components/            # reusable components
│   │   ├── RichText.tsx      # markdown rendering (CollapsiblePre + renderRich)
│   │   ├── Toast.tsx         # toast notification system
│   │   ├── ChatHeader.tsx    # chat panel header
│   │   ├── ChatInput.tsx     # chat input box
│   │   ├── ChatMiniBar.tsx   # minimized chat panel bar
│   │   ├── ExampleChips.tsx  # example question chips
│   │   ├── HudHeader.tsx     # HUD header
│   │   ├── HudLinks.tsx      # quick launcher links (with search)
│   │   ├── LockScreen.tsx    # app lock screen (password protection)
│   │   ├── MiniBar.tsx       # minimized HUD bar
│   │   ├── PomodoroTimer.tsx # pomodoro timer
│   │   ├── PromptTemplates.tsx # prompt template selector
│   │   ├── SettingsPanel.tsx # settings page
│   │   ├── ClipboardHistory.tsx # clipboard history
│   │   ├── CustomItemsManager.tsx # custom items (passwords) manager
│   │   └── CustomItemsQuickAccess.tsx # custom items quick access
│   ├── hooks/                 # custom React hooks
│   │   ├── useBackends.ts    # backend health check
│   │   ├── useClipboardHistory.ts # clipboard history
│   │   ├── useCustomItems.ts # custom items (passwords)
│   │   ├── useDebugMode.ts   # debug mode toggle
│   │   ├── useDragWindow.ts  # window dragging
│   │   ├── useFlash.ts       # simple flash notification
│   │   ├── useHistory.ts     # conversation history
│   │   ├── usePomodoro.ts    # pomodoro timer
│   │   ├── usePrompts.ts     # prompt templates
│   │   ├── useSettings.ts    # settings management
│   │   ├── useSystemStats.ts # system stats (CPU/memory/disk)
│   │   └── useToast.ts       # toast notification system (global)
│   ├── utils/                 # utility functions
│   │   ├── chatUtils.ts      # chat utilities (formatting, path extraction)
│   │   ├── chatExport.ts     # chat export utilities (Markdown/JSON)
│   │   ├── crypto.ts         # encryption (AES-GCM + PBKDF2)
│   │   ├── keychain.ts       # macOS Keychain integration utilities
│   │   ├── mergedConfig.ts   # config merging (settings + .env)
│   │   ├── reminder.ts       # notification reminder
│   │   ├── urlValidator.ts   # URL validation (HTTPS, localhost, intranet detection)
│   │   └── windowUtils.ts    # window utilities
│   ├── types/                 # TypeScript type definitions
│   │   └── chat.ts           # chat-related types (Turn, ToolLog, etc.)
│   ├── styles/                # CSS styles (modular)
│   │   ├── base.css          # base styles (html, body, root)
│   │   ├── hud.css           # HUD main interface styles
│   │   ├── chat.css          # chat panel styles
│   │   ├── clipboard.css     # clipboard history styles
│   │   ├── window.css        # window/fullscreen/minimized styles
│   │   └── ui.css            # UI polish, toast, status bar
│   ├── config/                # configuration files
│   │   ├── launchers.public.json  # public launchers (committable)
│   │   └── launchers.local.json   # private launchers (gitignored)
│   └── assets/
├── src-tauri/                # Rust backend (the actual Tauri crate)
│   ├── src/
│   │   ├── main.rs           # thin entry that calls lib run()
│   │   ├── lib.rs            # app entry: Tauri init, global hotkey, tray icon
│   │   ├── system_stats.rs   # system monitor (CPU/memory/disk/network)
│   │   ├── launcher.rs       # local app/script launcher
│   │   ├── tray.rs           # tray menu (build/poll/event handling, system stats)
│   │   ├── settings.rs       # settings load/save (local JSON)
│   │   ├── panel.rs          # floating chat panel window management (multi-monitor)
│   │   ├── history.rs        # conversation history persistence
│   │   ├── hotkey.rs         # global hotkey management (parsing, registration)
│   │   ├── keychain.rs       # macOS Keychain integration (secure API key storage)
│   │   ├── builtin.rs        # built-in LLM client (OpenAI-compatible)
│   │   ├── resolve_studio.rs # Resolve Studio backend bridge
│   │   ├── spring_harness.rs # Spring Harness backend bridge
│   │   ├── harness.rs        # Resolve Harness backend bridge
│   │   └── resolve.rs        # shared resolve utilities
│   ├── Cargo.toml            # crate manifest (workspace member)
│   ├── tauri.conf.json       # app config: window, bundle, frontendDist
│   ├── capabilities/         # permission scopes (default.json)
│   └── icons/
├── public/                   # static assets served by Vite
├── index.html
├── package.json              # npm scripts: dev / build / tauri
├── .env.example              # environment variable template (copy to .env)
├── README.md                 # English documentation
├── README.zh.md              # 中文文档
└── vite.config.ts
```

## Architecture

### Frontend architecture

The frontend follows a **hooks + components + utils** architecture:

- **Components** (`src/components/`) — reusable UI components, each responsible for rendering and user interaction
- **Hooks** (`src/hooks/`) — custom React hooks that encapsulate stateful logic (data fetching, event listeners, timers)
- **Utils** (`src/utils/`) — pure utility functions with no React dependencies
- **Types** (`src/types/`) — shared TypeScript type definitions
- **Styles** (`src/styles/`) — modular CSS files, imported in order in `App.tsx`

### Backend architecture

The Rust backend follows a **modular command architecture**:

- **`lib.rs`** — app entry point: Tauri builder setup, global hotkey registration, tray icon initialization
- **`system_stats.rs`** — system monitor: CPU/memory/disk/network info via `sysinfo` + macOS `df -H`
- **`launcher.rs`** — local app/script launcher: cross-platform process spawning (macOS `open`, Windows `start`, Linux direct)
- **`tray.rs`** — tray menu: menu building, backend status polling (15s), menu event handling, system resource usage display
- **`settings.rs`** — settings management: load/save to local JSON, `settings-updated` event emission
- **`panel.rs`** — floating panel window management: create/close chat windows, position calculation, multi-monitor support
- **`history.rs`** — conversation history persistence: localStorage-style storage via Tauri filesystem
- **`hotkey.rs`** — global hotkey management: hotkey string parsing, registration/unregistration, default hotkey
- **`keychain.rs`** — macOS Keychain integration: secure storage for API keys via `security` command-line tool
- **`builtin.rs`** — built-in LLM client: OpenAI-compatible API with streaming
- **Backend bridges** (`resolve_studio.rs`, `spring_harness.rs`, `harness.rs`) — SSE proxy to backend services, streaming via Tauri `Channel`

### IPC flow

```
Frontend (React)
    │
    │ invoke("command_name", { ... })
    ▼
Tauri IPC layer
    │
    │ #[tauri::command]
    ▼
Rust backend (lib.rs + modules)
    │
    │ reqwest / std::process / sysinfo
    ▼
External services (resolve-studio / spring-harness / resolve-harness / OpenAI API)
```

### Window management

- **Main window** (`main`) — the HUD sprite, transparent, frameless, always-on-top, top-right anchored
- **Chat panels** (`resolve-*`, `spring-*`, `harness-*`, `builtin-*`) — floating chat windows, max 3 per type, cascaded positioning
- **Settings window** (`settings-*`) — settings page, independent window
- **Minimized state** — each window can be minimized to a compact bar (HUD: right side, chat panels: left side)

## Common commands

```bash
make dev         # npm run tauri dev — run the desktop app with hot reload
make build       # npm run tauri build — produce release bundles
make fe-build    # build frontend only (tsc && vite build → dist/)
make check       # cargo check — verify Rust compiles (needs dist/ to exist)
make clean       # remove node_modules, dist and src-tauri/target
make test        # run frontend tests (vitest)
```

## Configuration

### Settings page (recommended)

Click the ⚙ button in the header or "⚙ 设置" in the tray menu to open the visual settings page. All AI backend configurations can be set there, and they take effect immediately.

### Environment variables (fallback)

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

See `.env.example` for all available options. Settings page values take precedence over `.env`.

## Adding features

- **New Rust command** — add `#[tauri::command] fn my_cmd(...)` in `src-tauri/src/lib.rs` and register it in `invoke_handler`; call it from the frontend with `invoke("my_cmd", { ... })`.
- **Edit the quick launchers** — edit `src/config/launchers.public.json` (public) or `src/config/launchers.local.json` (private, gitignored):
  ```json
  { "kind": "url",    "label": "GitHub", "url": "https://github.com" }
  { "kind": "app",    "label": "终端",   "app": "Terminal" }
  { "kind": "script", "label": "发布博客", "command": "~/bin/publish-blog.sh" }
  ```
  Scripts run detached with null stdio; to watch a long task live wrap it in a terminal, e.g. `command: "open -a Terminal ~/bin/task.sh"`.
- **Window / tray behavior** — window flags live in `src-tauri/tauri.conf.json`; the tray icon + menu are built in the `setup` hook of `src-tauri/src/lib.rs`. Hiding/showing the window from JS needs the `core:window:allow-hide` / `allow-show` permissions in `src-tauri/capabilities/default.json`.
- **New frontend page** — add components under `src/` and route them from `App.tsx`.

## Related projects

- [resolve-studio](https://github.com/erishen/resolve-studio) — Cordis agent runtime with tool calling + sandbox
- [spring-harness](https://github.com/erishen/spring-harness) — Spring AI Agent with ReAct reasoning
- [resolve-harness](https://github.com/erishen/resolve-harness) — synchronous Q&A + tool trace

Part of the `work/rust` workspace (photo-library, markdown-library, video-library, rag-task-service, resolve-tui).

## Download & Release

### Download channels
- **GitHub Releases**: https://github.com/erishen/sprite/releases
- **Personal website**: https://erishen.cn/sprite

### Checksum verification
Each Release provides SHA256 checksums. Verify file integrity after download:

```bash
# macOS
shasum -a 256 Sprite_*.dmg

# Windows (PowerShell)
Get-FileHash .\Sprite_*.exe -Algorithm SHA256

# Linux
sha256sum Sprite_*.AppImage
```

### Opening unsigned apps on macOS
The app is not notarized (no Apple Developer account). On first launch you may see "cannot be opened":

1. Right-click the app, select "Open"
2. Click "Open" again in the dialog
3. Or run in terminal: `xattr -cr /Applications/Sprite.app`

## Privacy Policy

**This app respects and protects user privacy:**

- ✅ **No user data collection** — all data is stored locally
- ✅ **No information upload** — no telemetry, statistics, or crash reports
- ✅ **Conversation history stored locally** — chat logs saved in local JSON files
- ✅ **Clipboard history stored locally** — saved locally only, never uploaded
- ✅ **AI requests user-configured** — API Key configured by user, requests sent directly to AI providers
- ✅ **Open source and transparent** — all code is open source, anyone can audit
- ✅ **HTTPS enforcement** — URL validation with HTTPS checks for all backend connections
- ✅ **App lock screen** — password-protected lock screen with auto-lock after idle time
- ✅ **Password vault encryption** — AES-GCM encryption with PBKDF2 key derivation for stored passwords
- ✅ **Password vault master password** — optional master password for additional password vault protection
- ✅ **System Keychain storage** — optional macOS Keychain integration for secure API key storage
- ✅ **Exportable chat history** — users can export and delete their conversation history at any time

**Data storage locations:**
- macOS: `~/Library/Application Support/cn.erishen.sprite/`
- Windows: `%APPDATA%\cn.erishen.sprite\`
- Linux: `~/.local/share/cn.erishen.sprite/`

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement.

In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.

**By using this software, you agree to assume all risks associated with its use.**

## License

This project is licensed under the **MIT License**.

### Third-party dependencies
This project uses the following open source software:

| Software | License |
|------|------|
| Tauri | MIT / Apache-2.0 |
| React | MIT |
| TypeScript | Apache-2.0 |
| Vite | MIT |
| Rust | MIT / Apache-2.0 |
| sysinfo | MIT |
| reqwest | MIT / Apache-2.0 |
| serde | MIT / Apache-2.0 |

See `Cargo.toml` and `package.json` for the complete dependency list.

## Author

- **GitHub**: [@erishen](https://github.com/erishen)
- **Personal website**: [erishen.cn](https://erishen.cn)
- **X (Twitter)**: [@erishen](https://x.com/erishen)
- **LinkedIn**: [erishen](https://www.linkedin.com/in/erishen/)

## Contributing

Issues and Pull Requests are welcome!

If you find this project useful, please give it a ⭐ Star to show your support.
