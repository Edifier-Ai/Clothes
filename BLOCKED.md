# BLOCKED

## B-1 环境工具缺失 —— 已解决（2026-07-27）

原始缺失输出（开工时）：`pnpm: command not found`、`java: command not found`、`adb: command not found`、`ANDROID_HOME=unset`。
解决（用户级，无管理员）：pnpm 11.17.0（`npm i -g pnpm`）；JDK 经 Adoptium zip 解压至 `C:\Users\Admin\tools\jdk-17`（构建显式使用）；adb 直接用 SDK `platform-tools/adb.exe` 1.0.41；Gradle 经本机代理 `127.0.0.1:7890`（写入 `~/.gradle/gradle.properties` 的 systemProp + GRADLE_OPTS，因 Java 不读 Windows 系统代理）。env-check 退出码 0。

## B-2 真机安装/启动 —— 已解决（骨架级）；完整闭环真机验收仍待业务卡

真机 OnePlus LE2120 已连接并安装启动 `com.clothes.app`（见 `scripts/evidence/MVP-000/INDEX.md`）。
设备策略限制（如实记录，非缺陷）：
- OPlus 把 shell `pm install` 与 `adb install` 都重定向到 GUI 确认页，且拒绝 `WRITE_SETTINGS`/`WRITE_SECURE_SETTINGS`，故 adb 无法改 `font_scale`/关校验；安装经 `input tap` 自动点确认完成，1.3× 字体矩阵改在 AOSP 模拟器取证。
- 真机对 MVP-000 骨架的「安装+启动+四标签切换+重启」已验收；**断网 12 件导入→抠图→推荐→替换→记录→重启→导出** 的完整真机闭环需待对应业务卡实现后再验，本卡不声称完成。

## B-8 抠图路径变更（2026-07-31 用户拍板）——端侧 ONNX 作废，改分割 API

- 原 B-3/B-5（端侧基准缺真图）随路径变更失效：MVP-002 已重写为分割 API 基准，候选为免费层 API，样本允许公开衣物数据集补足并标注来源。
- **选型已定（2026-07-31）：腾讯云数据万象 GoodsMatting 商品抠图**，用户已完成账号/存储桶配置。免费额度 1000 次（2 个月，首次使用自动发放）+ ¥0.01/次按量；备用候选阿里云 SegmentCloth/百度智能抠图（调研对比见决策记录）。
- 当前阻塞：~~① 本地基准凭证配置~~ **已解决（2026-07-31）**：真实冒烟通过（`smokeTencentCi.ts`，256×320 合成图，端到端 686ms，alpha 提取正常，COS 对象用后删除）；② 任务卡要求的 100–200 张目标场景样本与 Android 真机结果未备齐。完成前 MVP-002 保持 BLOCKED，不得标 ACCEPTED。
- 旧 on-device 探针（onnxruntime-react-native、segmentationProbe、benchmark 页）已从现役代码清理；历史结论保留在 Git 与 `PROGRESS.md`。
- 隐私继承要求：上传告知+用户明确确认（TECH_STACK 第 4 节），key 仅存设备端 expo-secure-store；COS 对象处理后即删，照片不在云端留存。

## B-3 / B-5 旧端侧抠图阻塞 —— 已被 B-8 取代（2026-07-31）

旧 ONNX 模型、运行时和 on-device 探针不再是现役依赖，相关代码已经删除。仍有效的“真实样本不足”约束已合并到 B-8：GoodsMatting 已完成真实链路冒烟和 10 张公开样本试跑，但未达到任务卡要求的 100–200 张目标场景样本与真机终判，不得标记 MVP-002 `ACCEPTED`。现役证据见 `scripts/evidence/MVP-002/INDEX.md`。

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

## B-7 MVP-006 缺少真实 Android 手机验收（2026-08-01 更新）

- 代码、105 个自动化测试、类型检查、Lint、Android 原生构建和 390×844 模拟器主路径均已通过。
- 模拟器已覆盖单槽替换、整套换一套、模式、前台定位授权、拒绝定位、手选城市和离线缓存降级。
- 当前实体设备 `10c1b57d` 已连接，但 `adb devices -l` 状态为 `unauthorized`；当前副本也没有可安装 APK。任务卡明确要求“真机截图与一次离线录屏”，因此 MVP-006 保持 `BLOCKED`，不能提前标记为 `ACCEPTED`，也不能越过依赖激活 MVP-007。
- 解锁条件：在手机上确认 USB 调试授权；因新增 expo-secure-store，先重新 prebuild+构建，再安装生成的 Debug APK，按证据索引补拍
  TDY-03/04/05/08 截图和一次飞行模式/断网恢复录屏。
- 模拟器证据与复验清单：`scripts/evidence/MVP-006/INDEX.md`。
