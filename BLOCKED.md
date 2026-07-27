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
