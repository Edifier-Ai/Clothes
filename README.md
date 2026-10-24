# Clothes 智能衣橱

本地优先、可解释、Android 优先的智能衣橱。不注册可用；衣物、造型、穿着记录默认只在本机。

- 产品方案：`PRODUCT_PLAN.md`
- 技术边界：`TECH_STACK.md`（React Native + Expo Development Build + TypeScript strict）
- 设计基准：`design/HIGH_FIDELITY_UI_SPEC.md` 与 `design/screens/direction-3-quiet-luxury/`
- 任务卡与执行状态：`tasks/ROADMAP.md`、`tasks/EXECUTION_STATE.md`

## 环境（本机实测基线，2026-07-27）

| 工具 | 版本/位置 |
|---|---|
| Node | v24.18.0 |
| pnpm | 11.17.0（`npm install -g pnpm`） |
| JDK | 构建用 Temurin 17，`C:\Users\Admin\tools\jdk-17`（用户级 zip）；本机默认 `JAVA_HOME` 为 21，Gradle 9 二者皆可 |
| Android SDK | `C:\Users\Admin\AppData\Local\Android\Sdk`（platforms 34/35/36，build-tools 34/36/37） |
| 真机 | OnePlus LE2120，Android 14（API 34），arm64-v8a，1080×2412@480dpi |

复跑核对：`bash scripts/env-check.sh`

## 安装与质量门

```sh
# 需要代理时在本机全局配置，不要写进仓库 .npmrc：
#   pnpm config set proxy http://127.0.0.1:7890 --location=global
#   pnpm config set https-proxy http://127.0.0.1:7890 --location=global
pnpm install          # 根目录，workspace 全量安装
pnpm typecheck        # tsc --noEmit（strict）
pnpm lint             # expo lint (eslint flat config)，CI 要求 0 warning
pnpm test             # jest --ci，跳过数必须为 0
```

## 运行 Android

```sh
# 环境变量（本仓库未改系统 PATH，用显式路径）
export JAVA_HOME="/c/Users/Admin/tools/jdk-17.0.19+10"
export ANDROID_HOME="/c/Users/Admin/AppData/Local/Android/Sdk"

# 开发服务器
pnpm start

# 原生 Debug 构建并安装到已连接设备/模拟器（CNG prebuild 自动生成 android/）
pnpm --filter @clothes/mobile run android:debug
```

`android/` 与 `ios/` 是被忽略的 prebuild 产物；不要手工维护其中的业务配置。新增原生依赖后必须重新 prebuild，再构建新的 APK。

## 目录

```text
apps/mobile/
  src/app/(tabs)/      Expo Router 四标签：今天/衣橱/造型/计划
  src/core/            数据库、文件、任务队列（MVP-001+）
  src/domain/          领域模型与推荐规则（MVP-005+）
  src/features/        按用户闭环组织的页面与组件
  src/design-system/   方向 3 tokens（色板/字号/间距/圆角/点击目标）
  src/native/          腾讯云抠图、签名与平台文件适配（MVP-002+）
packages/              （规划中，尚未创建）可序列化契约与导出格式（MVP-013+）
scripts/               环境核对与验收脚本
```

## 当前状态

进度、验收证据与阻塞项分别见 `PROGRESS.md`、`tasks/EXECUTION_STATE.md` 与 `BLOCKED.md`；README 只放稳定信息，不再记录每轮测试数字。

- 抠图：腾讯云 GoodsMatting 为现役唯一路径；上传前明确告知并取得同意，密钥只存 SecureStore（建议使用只授权单个存储桶的 CAM 子账号密钥），断网可排队/跳过/仅保存原图。
- 持久化：SQLite 为会话查询引擎，`garments_mirror.json` 镜像兜底强杀丢写（`BLOCKED.md` B-4）；多语句写入统一走 `AppDb.withTransaction` / `GarmentDb.transaction` 串行事务。
- CI：`.github/workflows/ci.yml` 在 push/PR 时跑 typecheck、lint（0 warning）与 Jest。

## 红线

原图永不覆盖；当前 Git 根必须保持为 `D:/Projects/Clothes`，不暂存、不清理范围外内容；P0 无账号、无业务后端，除用户自配的抠图 API 与天气外不引入云依赖。
