# BLOCKED

## B-1 环境工具缺失 —— 已解决（2026-07-27）

原始缺失输出（开工时）：`pnpm: command not found`、`java: command not found`、`adb: command not found`、`ANDROID_HOME=unset`。
解决（用户级，无管理员）：pnpm 11.17.0（`npm i -g pnpm`）；JDK 经 Adoptium zip 解压至 `C:\Users\Admin\tools\jdk-17`（构建显式使用）；adb 直接用 SDK `platform-tools/adb.exe` 1.0.41；Gradle 经本机代理 `127.0.0.1:7890`（写入 `~/.gradle/gradle.properties` 的 systemProp + GRADLE_OPTS，因 Java 不读 Windows 系统代理）。env-check 退出码 0。

## B-2 真机安装/启动 —— 已解决（骨架级）；完整闭环真机验收仍待业务卡

真机 OnePlus LE2120 已连接并安装启动 `com.clothes.app`（见 `scripts/evidence/MVP-000/INDEX.md`）。
设备策略限制（如实记录，非缺陷）：
- OPlus 把 shell `pm install` 与 `adb install` 都重定向到 GUI 确认页，且拒绝 `WRITE_SETTINGS`/`WRITE_SECURE_SETTINGS`，故 adb 无法改 `font_scale`/关校验；安装经 `input tap` 自动点确认完成，1.3× 字体矩阵改在 AOSP 模拟器取证。
- 真机对 MVP-000 骨架的「安装+启动+四标签切换+重启」已验收；**断网 12 件导入→抠图→推荐→替换→记录→重启→导出** 的完整真机闭环需待对应业务卡实现后再验，本卡不声称完成。

## B-3 抠图真实照片基准 —— 未完成（待 MVP-002）

MVP-002 需 100–200 张真实衣物照片做端侧抠图基准；当前无照片夹具。按 Goal 决策以可公开复现夹具推进，真图验收标记未完成，激活 MVP-002 时细化夹具来源与阈值。

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
