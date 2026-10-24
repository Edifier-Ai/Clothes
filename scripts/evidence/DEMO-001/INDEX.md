# DEMO-001 录屏版验收索引

状态：`READY_FOR_RECORDING`  
日期：2026-08-28  
设备：Android 36 模拟器 `sdk_gphone64_x86_64`（`emulator-5554`）

## 交付物

- Release APK：`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- 包名 / 版本：`com.clothes.app` / `0.1.0`（versionCode 1）
- minSdk / targetSdk：24 / 36
- Release APK 大小：236,798,215 bytes
- Release SHA256：`485202092DA7CA9996D0E8A201E7F97A684B1564FACC60920C77A19EA608F33A`
- 真机兼容升级包：`physical-device/clothes-demo-54-items.apk`，236,898,218 bytes，SHA256 `B4866B6CF36A4AFF7125DA0C6A73A86446D71BC0C030579DCEDAA84E2361D930`
- 正式录屏操作稿：`RECORDING_SCRIPT.md`
- 无旁白运行态冒烟视频：`demo-smoke.mp4`（H.264，390×844，28.204 秒）

## 自动化门禁

| 门禁 | 结果 |
|---|---|
| `pnpm test` | 82 suites / 587 tests / 0 failed |
| `pnpm --filter @clothes/mobile typecheck` | exit 0 |
| `pnpm --filter @clothes/mobile lint` | 0 errors / 10 historical warnings |
| `git diff --check` | exit 0 |
| `scripts/validate-planning.ps1` | exit 0，59/59 页面有任务覆盖，Errors=0 |
| `gradlew assembleRelease` | BUILD SUCCESSFUL |

Jest 仍输出既有 React `act(...)` 警告；它们没有造成失败。Lint 的 10 条 warning 也均为历史非阻断项。

## 运行态闭环

| 验收点 | 证据 | 结论 |
|---|---|---|
| 首启直接体验 Demo | `390x844-welcome.png` | 首屏一键载入，不要求账号 |
| 干净冷启动 | `390x844-today-clean-restart.png` | force-stop 后直接进入今日推荐，日期/数据保留 |
| 54 件衣物 | `physical-device/emulator-wardrobe-54-items.png` | 54 件内置透明底实图全部导入，新增配饰、鞋履真实渲染 |
| 18 套造型 | `390x844-looks-fixed.png` | 衣物分层不重叠，卡片可区分 |
| 计划 / 日历 | `390x844-plan-ready.png` | 当天及未来计划在月历中可见 |
| 推荐要素 | `390x844-factors.png` | 6 个要素均可独立选择 |
| 设置跨重启 | `390x844-settings-persisted.png` | 关闭一项后冷启动仍显示 5/6 |
| 交付起点设置 | `390x844-settings-ready.png` | 最终已恢复 6/6 |
| 记录已穿 | `390x844-record-wear.png` | 场景、舒适度与完成记录真实可点 |
| 记录驱动洞察 | `390x844-insights-after-record.png` | 8 天写入后变 9 天，force-stop 后仍存在 |
| 干净演示洞察 | `390x844-insights-clean-ready.png` | 最终录屏起点恢复为 8 天 |
| 购物候选 | `390x844-shopping-saved.png` | 内置案例可从已保存候选进入 |
| 购物证据 | `390x844-shopping-similar.png` | 无商品图时不伪造相似度，明确证据不足 |
| 可搭报告 | `390x844-shopping-report.png` | 基于真实衣橱实时得到 18 套合法组合 |
| 演示数据边界 | `390x844-demo-ready-after.png` | 明示只替换 `demo-v1` 数据，不伤用户内容 |

记录闭环的验证顺序为：加载 8 天演示历史 → “就穿这套” → 完成记录 → force-stop → 冷启动 → 洞察显示 9 天。之后执行整应用测试数据清理并重新载入，最终模拟器保持 8 天干净录屏起点。

## 响应矩阵

| 配置 | 证据 | 结果 |
|---|---|---|
| 360×800 / 1.0× | `360x800-today.png` | 主卡、齿轮和四标签可见，无横向裁切 |
| 390×844 / 1.0× | `390x844-today-ready.png` | 标准录屏尺寸通过 |
| 430×932 / 1.0× | `430x932-today.png` | 大屏布局通过 |
| 390×844 / 1.3× | `390x844-font1.3-today.png`、`390x844-font1.3-settings.png` | 文案换行正常，核心入口仍可操作 |

最终模拟器已恢复 `390×844`、字体 `1.0×`、时区 `Asia/Shanghai`，并停在今日页。

## 范围与证据边界

- 已从可见产品面移除天气、备份、导出、恢复；历史天气 schema / migration 与镜像字段只为旧数据升级兼容保留，不存在天气 UI 或请求。
- “恢复”一词仍会出现在衣物归档恢复、草稿恢复和任务恢复等正常功能中，不等于已移除的备份恢复。
- 当前运行态证据来自 Android 模拟器，不代表物理 Android 设备验证。
- aapt2 从最终 Release APK 资源表核得 `assets_demogarments_*` 恰好 54 项；Metro Release bundle 也命中全部 54 个素材名。
- `demo-smoke.mp4` 用于证明页面可以连续录制，不是带旁白的最终营销视频；正式 5–7 分钟录制按 `RECORDING_SCRIPT.md` 执行。
