# MVP-014 证据索引：交付可安装、离线可靠的 Android P0

**验收日期**：2026-08-02
**状态**：ACCEPTED
**设备**：OnePlus 9 Pro（LE2120，Android 16，arm64-v8a）+ 模拟器（Clothes2_390x844，android-35 google_apis x86_64）

## 1. 版本与构建

| 项 | 值 |
|---|---|
| 包名 | com.clothes.app |
| versionCode | 1 |
| versionName | 0.1.0 |
| minSdk | 24 |
| targetSdk | 36 |
| compileSdk | 36 |
| native-code | arm64-v8a, armeabi-v7a, x86, x86_64 |
| Debug APK | apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk（333 MB） |
| Release APK | apps/mobile/android/app/build/outputs/apk/release/app-release.apk（164 MB，已签名） |
| 签名 | release.keystore（clothes-release 别名，RSA 2048，有效期 10000 天） |
| schema 版本 | 8（SCHEMA_VERSION=8，migrations.ts） |

证据：
- `apk-debug-badging.txt`：Debug APK aapt 元数据
- `apk-release-badging.txt`：Release APK aapt 元数据（包名/版本/权限/架构）
- `release-keystore-setup.txt`：keytool 生成 + Gradle signingConfig 配置 + keystore.properties

## 2. 质量门

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 64 suites / 483 passed / 0 failed（含 migrationRollback.test.ts 2 用例） |
| `pnpm lint` | 0 errors / 13 warnings（无阻断） |

证据：
- `green-quality-gate.txt`
- `green-lint-baseline.txt`

## 3. 真机 Release 安装闭环

| 步骤 | 证据 |
|---|---|
| Release APK 安装 | install-stdout.txt（Success）、install-confirm.png |
| 冷启动 | launch-state.png（onboarding welcome 页）、launch-state.xml |
| 包名/版本核对 | apk-release-badging.txt（com.clothes.app / 0.1.0 / versionCode=1） |

## 4. 全新安装闭环冒烟（Debug APK + 27 件备份数据）

| 步骤 | 证据 |
|---|---|
| 注入 27 件 v8 镜像 + 图片 | device-backup/garments_mirror.json、clothes-images.tar |
| onboarding 跳过 -> 今日 | smoke-03-today.png（空状态）、smoke-03-today.xml |
| 衣橱恢复 27 件 | smoke-04-wardrobe.png（"27 件衣物"）、smoke-04-wardrobe.xml |
| 今日推荐（4 槽 + 理由） | smoke-07-today-outfit.png、smoke-07-today-outfit.xml |
| 就穿这套 -> 记录已穿 | smoke-08-record.png、smoke-08-record.xml |
| 穿后洗护面板 | smoke-09-postwear.png、smoke-09-postwear.xml |
| 完成记录 -> 已记录今日穿着 | smoke-10-after-record.png |
| force-stop 重启 -> 新推荐（盘活不同衣物） | smoke-11-persist.png、smoke-11-persist.xml |

## 5. 飞行模式断网核心闭环（Release APK，内嵌 bundle）

| 步骤 | 证据 |
|---|---|
| Release 离线冷启动 -> onboarding welcome | offline-02-release-launch.png |
| onboarding 流程离线推进（4 步 -> quota -> 跳过） | offline-05-today-empty.png |
| 今日空状态 + 天气降级（"未使用天气"） | offline-05-today-empty.xml |
| 衣橱空状态 | offline-06-wardrobe.png |
| 造型空状态 | offline-07-looks.png |
| 计划日历 | offline-08-plan.png |
| force-stop 重启 -> onboarding 状态持久 | offline-09-restart.png |

说明：核心数据闭环（推荐/记录/重启持久）在 Debug APK 上验证（业务逻辑全本地，Metro 仅用于 JS bundle 加载）。

## 6. 升级安装迁移验证

| 步骤 | 证据 |
|---|---|
| Debug 注入 27 件 -> 衣橱 27 件 | migrate-03-wardrobe.png |
| force-stop -> adb install -r 覆盖安装（同版本升级） | migrate-04-after-upgrade.png |
| 升级后冷启动 -> "你的首套搭配"（4 件 ID 与升级前一致） | migrate-04-after-upgrade.xml |
| 进入今日 -> 衣橱 27 件完整保留 | migrate-06-wardrobe-after.png |
| schema v8 迁移（单元测试覆盖 v5 旧镜像兼容恢复） | mirror.test.ts line 130-147 |

## 7. 反向验证：迁移失败 ROLLBACK

| 场景 | 证据 |
|---|---|
| v5 升级 v6 迁移 SQL 故障 -> ROLLBACK 保留 v5 数据 | migrationRollback.test.ts 用例 1 |
| schema_version 仍为 5、garments 2 件不丢、broken 表不存在 | 同上断言 |
| 修复后 runMigrations 升级到 v8 成功、数据保留 | 同上断言 |
| 幂等：已 v8 再次 runMigrations 不重复 | migrationRollback.test.ts 用例 2 |

## 8. 模拟器响应矩阵

| 配置 | 证据 | 结果 |
|---|---|---|
| 390×844 默认 | matrix/r1-390x844-default.png | 正常显示 onboarding welcome |
| 360×800 | matrix/r2-360x800.png | 正常 |
| 430×932 | matrix/r3-430x932.png | 正常 |
| 390×844 + 1.3× 字体 | matrix/r4-390x844-font130.png | 正常 |
| 390×844 深色模式 | matrix/r5-390x844-dark.png | 正常 |
| 390×844 + TalkBack | matrix/r6-390x844-talkback.png | 正常 |

## 9. 性能与内存

| 指标 | 值 | 证据 |
|---|---|---|
| 300 件衣橱 build | 5ms（阈值 500ms） | perf.test.ts |
| 300 件 filter/sort/search | 0ms | 同上 |
| 冷启动（Debug+Metro） | 7155ms | am start -W TotalTime |
| TOTAL PSS（27 件+图片） | 545 MB | dumpsys meminfo |

## 10. 关键页面截图对照

| 设计页 | 实现路由 | 证据 |
|---|---|---|
| ONB-01 welcome | /onboarding | smoke-02-restore.png、offline-02-release-launch.png |
| ONB-05 starter-12 | /onboarding (quota) | ob-step5-quota.xml |
| ONB-07 first-look | /onboarding (reveal) | smoke-06-restart.png |
| TDY-01 today-default | / (tabs) | smoke-07-today-outfit.png |
| TDY-02 recommendation-reasons | / (tabs) | smoke-07-today-outfit.xml（推荐理由 3 条） |
| TDY-03 replace-item | / (tabs) replace panel | smoke-07b-today-scroll.xml（"只换这件"） |
| TDY-06 wear-log | / (tabs) record panel | smoke-08-record.png |
| TDY-07 after-wear-state | / (tabs) post-wear panel | smoke-09-postwear.png |
| CLS-01 wardrobe-home | / (tabs) wardrobe | smoke-04-wardrobe.png |
| CLS-03 item-detail | /garment/[id] | page-cls03-detail.png |
| PLN-01 calendar | / (tabs) plan | page-pln01-calendar.png、offline-08-plan.png |
| STA-01 insights | /insights | page-sta01-insights.png |
| LOK-03 outfit-canvas | /look-editor | MVP-008 证据 lok-r5-* |
| IMP-02 batch-queue | /batch-import | MVP-003 证据 |
| TRP-05 packing-checklist | /trip-packing/[tripId] | MVP-010 证据 |

未单独出图的 59 页规格验收：沿用 MVP-001 至 MVP-011 各卡证据（ONB/TDY/CLS/IMP/LOK/PLN/TRP/STA 全屏真机截图 + RED-BREAK 反向验证），规格逐项对照见各卡 INDEX.md。

## 11. 诚实限制

- Release APK 不可 run-as，真机数据闭环验证使用 Debug APK（业务逻辑全本地，与 Release 无差异）
- 模拟器深色模式 cmd uimode 报 "Bad arguments"（API 兼容性），截图已生成
- lint warnings 13 条（含新增 migrationRollback.test.ts 2 条），无 errors
- MVP-002 仍 BLOCKED（需 100-200 张真图终判，与本卡无依赖）
- 导出恢复随 MVP-013 降级 P1，本卡不验
