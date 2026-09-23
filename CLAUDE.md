# 项目：手机数独 PWA（经典 / 对角线 / 锯齿 / 杀手 / 武士）

**每次会话开始，先读 `PROGRESS.md`**，按其中的“下一步”继续。

## 必须遵守
- 需求原文在 `docs/SPEC.md`，一切以它为准（不得改动该文件）。
- 严禁内置题库 / 固定终盘变换；难度必须由人类技巧求解器真实评出；不许占位按钮与假数据。
- 存档神圣：任何改动都不能导致 IndexedDB 存档丢失；改数据结构必须写迁移 + 迁移测试。
- 每完成一个可测试的小步骤就提交并推送到工作分支；每个里程碑结束更新 PROGRESS.md（写真实测试数字）。
- 与用户（称呼“老大”）交流用简体中文，汇报适合手机阅读：先一句结论，再列完成项 / 测试数字 / 需要手机检查的点 / 下一步。

## 技术栈
Vite 8 + TypeScript 7 + Preact（UI）；Vitest（单元）；Playwright（E2E，WebKit + Chromium，手机设备模拟）。
自写 PWA 插件：`scripts/pwa-plugin.ts` 生成 manifest 与带预缓存清单的 `sw.js`（模板 `src/sw-template.js`）。

## 目录
- `src/engine/`：纯算法（无 DOM）：PRNG、几何/单元、生成、唯一性求解器（双实现）、人类技巧求解器、评级、指纹。
- `src/app/`：界面（Preact 组件 + CSS）。
- `src/platform/`：环境检测、SW 注册与更新、安装、存储、音频、震动等平台适配。
- `tests/unit/`：Vitest；`tests/batch/`：批量生成验收（`FULL_SAMPLE=1` 跑完整样本）。
- `e2e/`：Playwright；`scripts/serve.mjs` 把 dist 挂在子路径下模拟 GitHub Pages。

## 常用命令
```bash
npm ci
npm run typecheck          # 类型检查
npm test                   # 单元测试（CI 小样本）
npm run test:full          # 完整批量样本（里程碑结束时跑，结果写入 PROGRESS.md）
npm run build:pages        # 以 /openai-quota-watch/ 子路径构建
npm run e2e                # 子路径构建 + Playwright（iPhone/WebKit、Pixel/Galaxy/Chromium）
```

## 环境注意
- 云端会话里 Playwright 的 WebKit 下载域名（cdn.playwright.dev / playwright.download.prss.microsoft.com）被拦截。
  变通：`dockerd &` 后 `docker pull mcr.microsoft.com/playwright:v1.63.0-noble`，
  再 `docker cp <容器>:/ms-playwright/webkit-2359 /opt/pw-browsers/`（chromium-1243 同理）。
- WebKit 的 `context.setOffline` 会拦截 SW 响应，离线测试用 `e2e/server.ts` 的“关服务器”方式模拟断网。
- `pkill -f serve.mjs` 会把自己所在的 shell 也杀掉，别这么用。
