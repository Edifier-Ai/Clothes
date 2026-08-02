# Clothes Mobile

Clothes 的 Android 优先 Expo Development Build。业务入口位于 `src/app/`，核心数据默认保存在本机；腾讯云 GoodsMatting 仅在用户配置凭证并明确同意上传后用于抠图。

## 常用命令

从仓库根目录执行：

```sh
pnpm install
pnpm start
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter @clothes/mobile run android:debug
```

新增原生依赖后先运行 `pnpm --filter @clothes/mobile prebuild -- --platform android`，再构建新的 APK。Expo Go 不是本项目的验收环境。

## 目录

- `src/app/`：Expo Router 页面与首启分流。
- `src/core/`：SQLite、文件镜像、队列、推荐、反馈和天气。
- `src/features/`：按用户闭环组织的交互。
- `src/native/`：腾讯云签名/抠图与平台文件适配。
- `src/design-system/`：方向 3 设计 token 和基础组件。

## 当前验收边界

2026-08-01 自动化质量门为 21 suites / 164 tests / 0 skipped、TypeScript 0 错误、ESLint 0 errors / 14 warnings。MVP-006 仍需物理 Android 截图和离线录屏；MVP-002/003 仍需足量目标场景照片与真机抠图/修边证据。现役状态以仓库根目录的 `tasks/EXECUTION_STATE.md` 为准。
