# MVP-006 验收证据索引

最后更新：2026-08-01（真机证据补齐）

## 当前结论

- 领域逻辑、SQLite 持久化、Today 交互、天气适配、自动化测试和 Android 原生构建已完成。
- 390×844 Android 模拟器已覆盖主要交互和离线缓存降级。
- **2026-08-01 真机证据已补齐**：实体设备 `10c1b57d`（OnePlus LE2120 / OnePlus 9 Pro，Android 14）
  完成 TDY-03/04/05/08 全部截图与飞行模式离线录屏，logcat 无崩溃。本卡可标 `ACCEPTED`。
- 真机运行包为 2026-08-01 重新 prebuild + 构建的 Debug APK（含 expo-secure-store，dex 中已确认
  securestore 类打入）。

## 真机构建（2026-08-01 现役安装包）

- 预生成：`npx expo prebuild --platform android --no-install`（成功）。
- 构建：`cd apps/mobile/android && ./gradlew assembleDebug`，`BUILD SUCCESSFUL in 9m 20s`，505 tasks。
  首次后台构建因 shell 无 ANDROID_HOME 失败；写入 `android/local.properties`（gitignored）后通过。
- APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，331,287,562 bytes。
- SHA-256：`FD731D144B5F2BAAE77C874E4EE576F3BAD8BB0102B52900893937D43B05AE1A`。
- expo-secure-store 原生代码确认打入：`app/build/intermediates/dex/debug/*/classes*.dex` 含 securestore。
- 安装：`adb install -r` Success，覆盖安装保留旧数据（镜像 v3 自动升级 v4）。

## 真机截图（10c1b57d，1080×2412）

| 验收点 | 文件 | 说明 |
| --- | --- | --- |
| 启动即今日页 | `device-tdy-01-today.png` | v3 镜像 12 件真实衣物直达今日页，推荐含真实 ID 与 3 条理由 |
| TDY-03 候选 | `device-tdy-03-replace-candidates.png` | 「只换上装」面板：其余单品已固定，仅同槽可用候选 |
| TDY-03 替换后 | `device-tdy-03-after-replace.png` | 上装 `019fa67a-f9…`→`019fa67a-d8…`，下装/鞋/外套 ID 完全不变 |
| TDY-04 面板 | `device-tdy-04-regenerate-panel.png` | 换一套：主角锁定开关、跳过原因（不合场景/不喜欢配色/今天想换风格）、新搭配预览 |
| TDY-04 重算后 | `device-tdy-04-after-regenerate.png` | 选「今天想换风格」后下装/鞋/外套全部更换且不重复上一套，主角上装保留 |
| TDY-05 模式 | `device-tdy-05-modes.png` | 稳妥/新鲜/主角单品/赶时间 四模式面板（硬约束优先说明） |
| TDY-05 应用新鲜 | `device-tdy-05-fresh-applied.png` | 新鲜模式重排，理由变为「新鲜模式，优先不同组合」 |
| TDY-08 入口 | `device-tdy-08-weather-options.png` | 天气设置：手选城市/记住城市/使用当前位置/无天气继续 |
| 前台授权 | `device-tdy-08-foreground-permission.png` | 仅点击「使用当前位置」后弹出系统前台定位授权（使用时允许/仅本次/拒绝） |
| 定位拒绝 | `device-tdy-08-location-denied.png` | 拒绝后提示「定位未授权，可手选城市或无天气继续」 |
| 手选城市 | `device-tdy-08-manual-city.png` | 上海 28.4–39.1℃ 实时参与推荐：外套槽消失，理由含「天气较热，无需外套」 |
| 离线缓存 | `device-tdy-08-offline-cache.png` | 飞行模式下「上海 28.4–39.1℃ · 使用缓存」，当前搭配完整保留 |

## 真机离线录屏

- `device-mvp006-offline-cache.mp4`：h264 1080×2412，时长 78.9s（scrcpy 4.1 `--time-limit=90`）。
  内容：应用已加载 → 开启飞行模式（`cmd connectivity airplane-mode enable`）→ 打开天气设置 →
  再次选择上海 → 显示「使用缓存」→ 推荐搭配不消失。
- 录制窗口（约 13:00:40–13:02:10）内的离线终态由同步截图 `device-tdy-08-offline-cache.png`
  （13:01，状态栏可见飞行模式图标）交叉印证。
- 环境限制（如实记录）：设备自带 `screenrecord` 在该 OnePlus/Android 14 上启动即段错误
  （exit 139，`am force-stop com.oplus.screenrecorder` 后依旧），故改用 scrcpy（便携包存于
  `scripts/evidence/.tools/`，未系统安装）完成录制；本机 winget ffmpeg 不支持该视频的 ycgco
  色彩空间抽帧，视频流本身经 ffprobe 校验有效（h264/1080×2412/78.9s）。
- 录制结束后已 `cmd connectivity airplane-mode disable` 恢复网络，并清理 /sdcard 临时文件。

## 自动化质量门

- TypeScript：0 错误。
- Jest：15 suites / 105 tests / 0 skipped。
- ESLint：0 errors / 17 个既有 warnings。
- 重点覆盖：
  - 只替换一个槽位时其余衣物 ID 不变；
  - 候选耗尽、整套重复抑制和主角单品锁定；
  - 反馈权重不能覆盖可用性、天气等硬约束；
  - 反馈幂等写入；
  - 天气 fresh/stale/offline/no-cache；
  - 天气响应缺字段或格式异常时返回无天气，不伪造温度；
  - 定位拒绝后手选城市和关闭天气仍可继续使用。

## Android 构建（2026-07-30 历史产物）

- 预生成：`npx expo prebuild --platform android --no-install`
- 构建：Android `assembleDebug`
- 结果：`BUILD SUCCESSFUL in 5m 28s`，505 tasks。
- 当时 APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`；2026-08-01 当前副本中该文件不存在，不能作为现役安装包。
- APK 元数据：`com.clothes.app`，versionName `0.1.0`，versionCode `1`，minSdk 24，targetSdk 36。
- APK 大小：331,113,153 bytes。
- SHA-256：`B72DFDA434AC11D16B5DAAAF76BBF9F7A7A5187CBB835D0EBA074EBFE8B79A48`。
- 完整日志：
  - `gradle-build.stdout.log`
  - `gradle-build.stderr.log`
- 日志包含 `shopify_react-native-skia` 任务，证明本次 APK 已纳入 Skia 原生模块。

## 模拟器截图

| 验收点 | 文件 | 说明 |
| --- | --- | --- |
| 今日初始状态 | `tdy-01-seeded-today.png` | 12 件本地测试衣物生成今日搭配 |
| TDY-03 候选 | `tdy-03-replace-candidates.png` | 打开单槽替换候选 |
| TDY-03 替换后 | `tdy-03-after-replace-green.png` | 只改变上装，其他槽位保持 |
| TDY-04 整套 | `tdy-04-regenerate.png` | 整套重算、主角锁定与跳过原因 |
| TDY-05 模式 | `tdy-05-modes.png` | 稳妥、亮眼、主角单品、赶时间 |
| TDY-08 入口 | `tdy-08-weather-options.png` | 定位、手选城市和不使用天气 |
| 前台授权 | `tdy-08-foreground-permission.png` | 仅主动点击后显示系统定位授权 |
| 定位拒绝 | `tdy-08-location-denied.png` | 拒绝后仍可手选城市或关闭天气 |
| 手选城市 | `tdy-08-manual-city.png` | 上海天气成功参与推荐 |
| 离线缓存 | `tdy-08-offline-cache.png` | 断网后显示缓存，搭配不消失 |

## 离线录屏

- `mvp006-offline-cache.mp4`：应用保持运行后关闭 Wi-Fi/移动数据，再选择已缓存上海；
  页面显示“使用缓存”，推荐搭配继续可用。
- Debug APK 依赖 Metro；强制结束应用后在完全断网状态无法重新加载 JS，这是开发构建限制，
  不作为产品离线逻辑失败。真机验收应在应用已加载后切换飞行模式，或使用独立 Release 包。
- 首次尝试时的 Metro 连接失败录屏不属于验收证据，已在用户确认清场后于 2026-08-01 移入 Windows 回收站。
- 取证结束时 `adb devices -l` 仅列出 `emulator-5554`，没有物理手机；
  最近 300 行错误日志中未发现 `FATAL EXCEPTION`、`AndroidRuntime` 或 React Native 崩溃。

## 持久化证据

- 本地镜像版本：v4。
- 测试数据：12 件衣物、3 条反馈事件、1 条上海天气缓存。
- 天气 provider：`open-meteo`（当前环境未配置和风天气 API Key，因此按设计使用备用源）。
- 反馈样例包含：单槽替换前后衣物 ID、跳过原因和 `fresh` 模式。

## 真机解锁清单（2026-08-01 全部完成）

1. ✓ ADB 已授权：`adb devices` 中 `10c1b57d` 状态为 `device`。
2. ✓ 重新 prebuild + Debug 构建，dex 确认含 securestore，覆盖安装并启动（数据保留，镜像 v3→v4）。
3. ✓ TDY-03、TDY-04、TDY-05、TDY-08 四组真机截图补齐（见上表）。
4. ✓ 飞行模式录屏 `device-mvp006-offline-cache.mp4`：缓存降级且搭配不消失。
5. ✓ `adb logcat` 扫描无 `FATAL EXCEPTION`、无 AndroidRuntime/ReactNativeJS 错误。
6. ✓ 真机型号（OnePlus LE2120 / Android 14）、截图与录屏已写入本索引。
7. ✓ 设备镜像 v4 持久化复核：含 12 件衣物、replace/skip/mode 三条反馈事件、上海天气缓存。
8. 结论：MVP-006 标记 `ACCEPTED`，可激活 MVP-007。
