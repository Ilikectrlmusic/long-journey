# 长日记 · 精力日历

适配手机与电脑的纯 HTML / CSS / JavaScript 网站，托管在 GitHub Pages，无构建依赖。

- 日历：`https://ilikectrlmusic.github.io/long-journey/`
- 编辑：`https://ilikectrlmusic.github.io/long-journey/edit/`（`/edit` 会自动跳转）

## 记录规则

场景默认建议：在家为绿色、增加；学校为白色、不变；小耗为黄色、减少；大耗为红色、归零。场景和实际变化可分别调整。每日圆圈显示变化，圆下显示截止当天的累计；归零显示汉字「零」，之后从 0 重新累计。未记录的日期延续累计，未来日期不计入当前总分。可以补改从起点至今天的任意日期，跨月累计自动重算。

进度条参考刻度为 0–100，条形显示限制在此范围，实际累计数值不截断。

## 云端编辑

记录保存在本仓库 `data/energy.json`。浏览页面会读取 GitHub 最新记录；网络或 API 限流时尝试读取已发布的数据，并明确提示可能滞后。读取失败不会当成空记录或覆盖原文件。

在 `/edit/` 点击「连接 GitHub」，按页面说明创建 fine-grained personal access token：仅选择 `Ilikectrlmusic/long-journey`，授予 **Contents: Read and write**。密钥只在浏览器与 `api.github.com` 之间使用，不写入代码、记录或 Git 仓库。默认保留于当前浏览器会话；明确勾选「在这台私人设备上保持连接」后才持久保存在该设备。可以随时断开或在 GitHub 撤销密钥，过期后需重新连接。每台编辑设备需各自连接。

这不是公开免登录编辑入口。仅有仓库写权限的账号和有效密钥可以保存。所有记录和留言在公开仓库及网站上公开可见，Git 历史也会保留旧版本，请不要填写私密内容。

保存前重新读取云端，以单日为单位合并其他设备的修改；如果同一天已被修改，则提示冲突，不覆盖。GitHub 文件 SHA 同时防止并发覆盖。只有 GitHub 确认保存成功才显示「已同步」。没有本地离线保存模式。若网络在提交过程中断开，先重新读取云端核对结果，再决定是否重试。

## 本地开发与验证

需要 Node.js 22 或更新版本（当前环境为 24）。无须 `npm install`。

```sh
cd /workspace/long-journey
npm run dev
```

开发服务监听 4173 端口，可用 `PORT` 修改；支持仓库前缀 `/long-journey/` 与 `/long-journey/edit/`。本地页面同样指向真实 GitHub 仓库；用真实密钥保存会修改云端记录。

```sh
npm test
python tests/browser_smoke.py
```

浏览器验证需要开发服务已运行，以及 Python Playwright 与 Chromium。它拦截并模拟 GitHub API，不发送真实写入；覆盖云端保存、跨设备读取、补录重算、归零、冲突、失败提示、删除、移动端布局和公开备份回退。

## 部署

GitHub Pages 设置为 **Deploy from a branch → main → /(root)**。`.nojekyll` 保持静态文件原样发布。推送代码或保存记录后 GitHub 会自动重新部署；页面优先从 GitHub API 读取最新记录，因此记录显示不必等待 Pages 构建。首次开通 Pages 需仓库管理员权限。此仓库不需要服务端、数据库、Actions 密钥或第三方服务。
