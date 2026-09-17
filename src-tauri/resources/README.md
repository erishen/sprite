# resources/ — 首次启动种子数据（可选）

Tauri 打包时会把本目录内容原样复制到 `Contents/Resources/resources/`。
应用首次启动时（`bootstrap.rs`），若 `~/Library/Application Support/cn.erishen.sprite/`
中缺少对应文件，会从这里复制一份作为初始数据；已存在的文件绝不覆盖。

## 布局（扁平）

- `settings.json`      → `app_data_dir/settings.json`
- 其余 `*.json`（如 `resolve-9.json`）→ `app_data_dir/history/<同名>`

用扁平而非 `history/` 子目录，是因为 Tauri 对**无任何匹配的**资源 glob 会直接
构建失败。单个 `resources/*` 总能被下面这个 README 命中，因此个人数据可以整个
gitignore 掉，而不影响全新 checkout / CI 的构建。

## 为什么这里是"空"的

`*.json` 都是**个人运行数据**（可能含 API key、对话记录、本机路径），已在
`.gitignore` 中排除，不提交到 git。本 README 就是那个保底命中项。

## 本地构建想带上自己的数据

```bash
D=~/Library/Application\ Support/cn.erishen.sprite
cp "$D/settings.json" src-tauri/resources/
cp "$D"/history/*.json src-tauri/resources/
pnpm run tauri build
```
