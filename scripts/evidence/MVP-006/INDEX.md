# MVP-006 验收证据索引

日期：2026-07-30

## 当前结论

- 领域逻辑、SQLite 持久化、Today 交互、天气适配、自动化测试和 Android 原生构建已完成。
- 390×844 Android 模拟器已覆盖主要交互和离线缓存降级。
- 当前未连接物理 Android 手机；任务卡要求真机截图与离线录屏，所以本卡仍为
  `BLOCKED`，不得以模拟器证据标记 `ACCEPTED`。

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

## Android 构建

- 预生成：`npx expo prebuild --platform android --no-install`
- 构建：Android `assembleDebug`
- 结果：`BUILD SUCCESSFUL in 5m 28s`，505 tasks。
- APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
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
- `mvp006-offline.mp4` 是首次尝试时的 Metro 连接失败记录，不作为验收证据。
- 取证结束时 `adb devices -l` 仅列出 `emulator-5554`，没有物理手机；
  最近 300 行错误日志中未发现 `FATAL EXCEPTION`、`AndroidRuntime` 或 React Native 崩溃。

## 持久化证据

- 本地镜像版本：v4。
- 测试数据：12 件衣物、3 条反馈事件、1 条上海天气缓存。
- 天气 provider：`open-meteo`（当前环境未配置和风天气 API Key，因此按设计使用备用源）。
- 反馈样例包含：单槽替换前后衣物 ID、跳过原因和 `fresh` 模式。

## 真机解锁清单

1. 连接 OnePlus 或任意物理 Android 手机，确认 `adb devices` 状态为 `device`。
2. 安装并启动本索引中的 Debug APK。
3. 补拍 TDY-03、TDY-04、TDY-05、TDY-08 四组真机截图。
4. 在应用已加载后开启飞行模式，验证缓存/无天气降级且当前搭配不消失，录制一次视频。
5. 检查 `adb logcat` 无崩溃和原生模块错误。
6. 将真机型号、Android 版本、截图与录屏写入本索引。
7. 全部通过后把 MVP-006 标记为 `ACCEPTED`，再激活 MVP-007。
