# MVP-000：建立可重复构建、测试和安装的 Android 工程

## 用户价值

后续每个闭环都能在真实 Android 上稳定安装、启动和验证，不被父仓库、环境或一次性命令拖垮。

## 场景与流程

执行者核对环境与规格 → 建立独立 Git 边界 → 创建 Expo Development Build 工程 → 建立四项主导航和设计 Token → 运行测试 → 构建并启动 Android Debug。

## 必须完成

- 核对 Git 根、Node、pnpm、Java、Android SDK、ADB 和已连接设备；原始版本写入 `PROGRESS.md`。
- 若 Git 根不是当前目录，在当前目录初始化独立仓库；不得触碰父仓库 staged 状态。
- 按 `TECH_STACK.md` 创建 `apps/mobile`，启用 TypeScript strict、Expo Router、lint、typecheck、test。
- 建立 `今天 / 衣橱 / 造型 / 计划` 四项导航和“静奢编辑部”基础 tokens。
- 建立 `apps/mobile/src/core`、`domain`、`features`、`design-system`、`native` 与测试目录。
- 加入本地开发说明、`.gitignore` 和可复跑脚本。

## 不做

- 不实现衣物业务、抠图、账号、云同步或完整页面。
- 不推送远端，不接入付费构建或分析服务。

## 状态与失败恢复

- 工具缺失时优先使用项目内或用户级安装；需要管理员权限时写 `BLOCKED.md`。
- 没有连接手机时允许模拟器完成骨架，但必须将真机启动列为未完成阻塞。
- Prebuild 后必须能从干净依赖安装重新生成，不允许手改生成文件却不留配置来源。

## 验收标准

- `git rev-parse --show-toplevel` 返回当前 `Clothes` 目录。
- `pnpm lint`、`pnpm typecheck`、`pnpm test` 退出码均为 0，跳过测试为 0。
- Android Debug 构建成功；四项导航可切换且进程重启后仍能启动。
- 390×844 截图与方向 3 的颜色、字体层级、圆角和底栏语义一致。

## 测试与证据

- 保存环境清单、三条质量命令输出、Gradle/Expo 构建输出和启动截图路径。
- 反向验证：临时制造一个 TypeScript 类型错误，证明 `pnpm typecheck` 失败；还原后重新通过。
- 记录父仓库在开始和结束时没有新增 staged 内容。

## 依赖与优先级

优先级 P0，依赖无。只有本卡验收后才能开始业务实现。

