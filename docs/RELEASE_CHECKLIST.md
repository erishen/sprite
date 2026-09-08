# 发布检查清单

发布新版本前，请按以下清单逐项检查：

## 代码质量
- [ ] `pnpm run build` 构建成功
- [ ] `pnpm exec tsc --noEmit` 无类型错误
- [ ] `pnpm test` 所有测试通过
- [ ] `cargo fmt -- --check` 代码格式正确
- [ ] `cargo clippy -- -D warnings` 无警告

## 版本号
- [ ] `package.json` 版本号已更新
- [ ] `src-tauri/Cargo.toml` 版本号已更新
- [ ] `src-tauri/tauri.conf.json` 版本号已更新
- [ ] Git tag 已创建（格式：v0.1.0）

## 安全检查
- [ ] `.env` 未被提交（检查 `git status`）
- [ ] `launchers.local.json` 未被提交
- [ ] 无硬编码的 API Key / Token
- [ ] 无敏感信息（个人路径、密钥等）

## 资源检查
- [ ] 应用图标已替换（非 Tauri 默认图标）
- [ ] 所有图片/图标可商用
- [ ] 第三方依赖协议合规

## 文档检查
- [ ] README.md 已更新
- [ ] 免责声明已添加
- [ ] 隐私政策已添加
- [ ] 下载链接有效
- [ ] 安装说明清晰

## 构建测试
- [ ] macOS 构建成功（.dmg）
- [ ] Windows 构建成功（.exe / .msi）
- [ ] Linux 构建成功（.AppImage / .deb）
- [ ] SHA256 校验和已生成

## 发布步骤
1. 提交所有代码：`git add . && git commit -m "release: v0.1.0"`
2. 创建 tag：`git tag v0.1.0`
3. 推送代码和 tag：`git push && git push --tags`
4. GitHub Actions 会自动构建并创建 Release
5. 检查 Release 页面，确认所有平台的安装包都已上传
6. 更新 erishen.cn 下载页面
7. 发布公告（可选）

## 回滚方案
- 如果发布有问题，删除 GitHub Release 和 tag
- 回滚代码到上一个版本
- 通知用户（如果有用户群）
