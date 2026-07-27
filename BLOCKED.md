# BLOCKED

## B-1 环境缺 pnpm / java / adb（原始输出，处理中）

2026-07-27 实测（Git Bash）：

```
$ pnpm --version
/usr/bin/bash: line 3: pnpm: command not found   (exit=127)
$ java -version
/usr/bin/bash: line 5: java: command not found   (exit=127)
$ adb version
/usr/bin/bash: line 6: adb: command not found    (exit=127)
$ echo $ANDROID_HOME
unset
```

可用项：`git` 2.x（根 `C:/Users/Admin/Desktop`）、`node v24.18.0`、`npm 11.16.0`、`corepack 0.35.0`、`winget`；网络可达 registry.npmjs.org 与 api.adoptium.net（HTTP 200）。
磁盘实测：Android SDK 完整存在于 `C:/Users/Admin/AppData/Local/Android/Sdk`（platform-tools/adb.exe、emulator、platforms 34/35/36、build-tools 34/36/37、system-images android-35/36 google_apis x86_64、AVD：Elow_API_36、MiraTest、Real001API35）；全盘常见路径未找到任何 java.exe。

处理路径（任务卡允许"项目内或用户级安装"）：
1. pnpm → `npm install -g pnpm`（npm 前缀为用户级 `C:\Users\Admin\AppData\Roaming\npm`，无需管理员）。
2. java → Adoptium Temurin 17 zip 解压至用户目录 `C:\Users\Admin\tools\jdk-17`，Gradle 经 `org.gradle.java.home` 指向，不动系统。
3. adb → 直接使用 SDK 内绝对路径。
每步结果记录于 `PROGRESS.md`；任一失败则在此升级为硬阻塞。

## B-2 无真机连接，真机验收未完成

`adb devices` 因 adb 不在 PATH 未能执行；安装后将在本条目补充输出。MVP-000 允许模拟器完成骨架，但完成条件要求"真实 Android 可安装启动"与抠图真图基准，真机/真图验收在连接设备前保持未完成。

## B-3 抠图真实照片基准未开始

MVP-002 需要 100–200 张真实衣物照片；当前无照片夹具。按 Goal 决策：用可公开复现夹具推进，真图验收标记未完成（待 MVP-002 激活时细化）。
