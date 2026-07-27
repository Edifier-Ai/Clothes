# MVP-000 验收证据清单

日期：2026-07-27  
设备/环境：真机 OnePlus LE2120（Android 14 / API 34 / arm64-v8a / 1080×2412@480dpi，≈360×804dp）；模拟器 android-35 google_apis x86_64（WHPX 加速）。  
构建：Expo SDK 57.0.8 / RN 0.86.0 / React 19.2.3 / Hermes / Fabric；Gradle 9.3.1 `BUILD SUCCESSFUL in 20m 6s`（353 tasks，exit 0）；APK `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`（229MB，含全 ABI 调试包）。

## 质量门（最终复跑，退出码 0，跳过 0）

| 命令 | 结果 |
|---|---|
| `bash scripts/env-check.sh` | `== env-check: OK ==` exit 0 |
| `pnpm typecheck` | `tsc --noEmit` exit 0 |
| `pnpm lint` | `expo lint` exit 0 |
| `pnpm test` | `Test Suites: 4 passed; Tests: 17 passed, 17 total; Snapshots 0` exit 0 |

红→绿反向验证：把 `spacing` 标注为 `Record<string,string>` 制造类型错误 → `pnpm typecheck` exit 2，报 `TS2322/TS2345`；`cp` 还原后 typecheck exit 0、test 17/17 exit 0。

## 截图（PNG 头已校验像素尺寸）

| 文件 | 尺寸/条件 | 证明 |
|---|---|---|
| `device-today-tab.png` | 1080×2412 真机 | 今日页渲染：衬线标题、副标题「7月27日星期一」、哑金发丝线、沙卡+酒红主按钮、底栏「今天」选中 |
| `device-wardrobe-tab.png` | 真机 | 点底栏切到衣橱，选中态迁移，空状态卡 02 |
| `device-looks-tab.png` | 真机 | 造型标签可切换 |
| `device-plan-tab.png` | 真机 | 计划标签可切换 |
| `device-after-restart.png` | 真机 | `am force-stop` 后 pid 为空，重拉得新 pid 24396 仍渲染（进程重启可启动） |
| `emu-390x844.png` | **390×844** | 设计基准画布，与方向 3 配色/层级/圆角/底栏语义一致 |
| `emu-360x800.png` | **360×800** | 小屏画布布局不破坏 |
| `emu-430x932.png` | **430×932** | 大屏画布布局不破坏 |
| `emu-390x844-font130.png` | 390×844 / `font_scale=1.3` | 1.3 倍系统字体下卡片与底栏仍完整（已还原 1.0） |

> 真机 OPlus 拒绝 `adb shell settings put system font_scale`（`WRITE_SETTINGS` 未授予 shell），故 1.3× 字体矩阵改在 AOSP 模拟器取证；真机原生 360×804 覆盖 360×800 档。

## 关键命令原始片段

- 真机安装：OPlus 拦截 shell `pm install` 与 `adb install` 至 GUI 确认页（`OPlusPackageInstallerActivity`）；经 `uiautomator dump` 定位后用 `input tap 810 2262` 点「安装」→ `InstallAppProgress` 显示「安装成功」，`adb install` exit 0；`pm list packages` 含 `package:com.clothes.app`。
- 启动：`adb reverse tcp:8081 tcp:8081` + `am start -n com.clothes.app/.MainActivity`；logcat `ReactNativeJS: Running "main" with {...,"fabric":true}`，系统启动窗 `removeStartingWindowAnimation`。
- 父仓库零暂存：开始与结束 `git -C C:/Users/Admin/Desktop diff --cached --name-only | wc -l` 均 = 27618。
- 独立 Git 边界：`git rev-parse --show-toplevel` = `C:/Users/Admin/Desktop/Projects/Clothes`。

## 环境实测（脚本输出）

```
git: git version 2.55.0.windows.3
node: v24.18.0
pnpm: 11.17.0
java: 构建用 Temurin 17（用户级 C:\Users\Admin\tools\jdk-17）；本机默认 JAVA_HOME=21.0.10，二者 Gradle 9 均可
adb: Android Debug Bridge version 1.0.41（SDK platform-tools）
design PNG total: 35；core screens dir PNG: 31（29 独立页 + 2 总览）
```
