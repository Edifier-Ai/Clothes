# BLOCKED

## B-1 环境工具缺失 —— 已解决（2026-07-27）

原始缺失输出（开工时）：`pnpm: command not found`、`java: command not found`、`adb: command not found`、`ANDROID_HOME=unset`。
解决（用户级，无管理员）：pnpm 11.17.0（`npm i -g pnpm`）；JDK 经 Adoptium zip 解压至 `C:\Users\Admin\tools\jdk-17`（构建显式使用）；adb 直接用 SDK `platform-tools/adb.exe` 1.0.41；Gradle 经本机代理 `127.0.0.1:7890`（写入 `~/.gradle/gradle.properties` 的 systemProp + GRADLE_OPTS，因 Java 不读 Windows 系统代理）。env-check 退出码 0。

## B-2 真机安装/启动 —— 已解决（骨架级）；完整闭环真机验收仍待业务卡

真机 OnePlus LE2120 已连接并安装启动 `com.clothes.app`（见 `scripts/evidence/MVP-000/INDEX.md`）。
设备策略限制（如实记录，非缺陷）：
- OPlus 把 shell `pm install` 与 `adb install` 都重定向到 GUI 确认页，且拒绝 `WRITE_SETTINGS`/`WRITE_SECURE_SETTINGS`，故 adb 无法改 `font_scale`/关校验；安装经 `input tap` 自动点确认完成，1.3× 字体矩阵改在 AOSP 模拟器取证。
- 真机对 MVP-000 骨架的「安装+启动+四标签切换+重启」已验收；**断网 12 件导入→抠图→推荐→替换→记录→重启→导出** 的完整真机闭环需待对应业务卡实现后再验，本卡不声称完成。

## B-3 / B-5 抠图真实照片基准 —— 管线就绪，真图缺，卡片 BLOCKED（2026-07-28）
MVP-002 需 100–200 张真实衣物照片；当前无真图。已交付可复跑基准管线（host tsx+pngjs：清单格式、
私有样本目录、合成夹具生成、逐图结果+联系表+报告、校验脚本、红→绿反向验证）与 on-device 探针代码
（onnxruntime-react-native，走文件/二进制），见 `scripts/evidence/MVP-002/INDEX.md`。
因无真图，「直接可用率≥80%/严重失败≤5%」与默认/备用模型选择**不得**据此判定，MVP-002 保持 BLOCKED，
不标最终验收。on-device 真机延迟待 `expo prebuild` 链接 onnxruntime-react-native + 真/转换模型后测。

## B-4 expo-sqlite 在本机提交不 fsync —— 已用文件镜像适配（2026-07-28）

实测（OnePlus LE2120 / Android 14 / expo-sqlite 57，原始证据）：同步与异步 API 写入后，
库文件 `files/SQLite/clothes.db` 的 mtime 在 save+flush 后**不变**；迁移内原始 `execAsync`
写哨兵行同会话 close+reopen 可见（页缓存），但 **force-stop 后重置**；即便
`PRAGMA journal_mode=DELETE`+`synchronous=FULL`、写后 `closeAsync`、绝对路径打开均不落盘。
对照：`run-as <pkg> sh -c 'echo x > files/probe.txt; sync'` **跨 force-stop 持久**，
故文件系统本身持久，问题仅在 expo-sqlite 的 SQLite 提交路径未 fsync，违反「数据不丢」最高优先级。

适配方案（已实现 `src/core/garments/mirror.ts`，证据见 PROGRESS.md）：以 expo-file-system 写的
JSON 镜像 `garments_mirror.json` 为持久事实源——每次写后 `writeAsStringAsync` 全量落盘（本机即持久），
启动时若镜像 `updatedAt` 新于 SQLite 内 `data_updated_at` 则回灌 SQLite；expo-sqlite 仍作会话查询引擎，
满足 TECH_STACK「本地 SQLite」并补齐本机缺失的落盘能力。dump/replaceAll 回灌逻辑由
`garmentsDao.test.ts` 单测覆盖（37 tests 全绿）。设备级「add→force-stop→重启仍在」在镜像 APK 验收。

## B-6 Skia 原生链接已解决；MVP-003 真图交互复验待补（2026-07-30 更新）

- 2026-07-28 的原始现象：Android 端进入抠图编辑器时，Skia 原生模块加载失败。
- 2026-07-30 已执行 Expo Android prebuild 和完整 Gradle Debug 构建；构建日志包含
  `shopify_react-native-skia` 原生任务，505 个任务全部完成，APK 可安装并启动。
- 原“Skia 未链接”根因已解除，不再阻塞后续原生构建。
- 尚未具备一组真实衣物原图与抠图结果，MVP-003 的真实触控修边、撤销/重做和导出仍需随
  B-3/B-5 的真图样本一起补验；在补验前不得把 MVP-003 标记为 `ACCEPTED`。
- 构建证据：`scripts/evidence/MVP-006/gradle-build.stdout.log`。

## B-7 MVP-006 缺少真实 Android 手机验收（2026-07-30）

- 代码、105 个自动化测试、类型检查、Lint、Android 原生构建和 390×844 模拟器主路径均已通过。
- 模拟器已覆盖单槽替换、整套换一套、模式、前台定位授权、拒绝定位、手选城市和离线缓存降级。
- 当前 `adb devices` 没有 USB 真机；任务卡明确要求“真机截图与一次离线录屏”，因此
  MVP-006 保持 `BLOCKED`，不能提前标记为 `ACCEPTED`，也不能越过依赖激活 MVP-007。
- 解锁条件：连接 OnePlus 或任意物理 Android 手机，安装
  `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，按证据索引补拍
  TDY-03/04/05/08 截图和一次飞行模式/断网恢复录屏。
- 模拟器证据与复验清单：`scripts/evidence/MVP-006/INDEX.md`。
