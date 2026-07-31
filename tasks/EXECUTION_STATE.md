# Clothes 长期执行状态

最后更新：2026-07-30
当前阶段：P0
当前任务：MVP-006
状态：MVP-005 ACCEPTED；MVP-006 BLOCKED（实现/自动化/模拟器完成，待物理 Android 真机证据；MVP-002/003 仍待真图，见 B-3/B-5/B-6/B-7）

## 状态枚举

- `READY`：可以开始。
- `IN_PROGRESS`：唯一正在执行的任务卡。
- `BLOCKED`：存在需要外部输入的阻塞。
- `ACCEPTED`：验收证据完整。

## 当前任务

| 字段 | 内容 |
|---|---|
| 卡片 | `tasks/backlog/MVP-006-replacement-feedback-weather.md`（BLOCKED） |
| 依赖 | MVP-005（✓ ACCEPTED） |
| 完成证据 | typecheck 0；15 suites / 105 passed / 0 skipped；lint 0 errors / 17 warnings；Android Debug 构建与模拟器主路径通过 |
| 外部阻塞 | 当前无 USB 物理 Android 手机；待补 TDY-03/04/05/08 真机截图和离线录屏 |

## MVP-002 结果（BLOCKED 无真图；管线/探针就绪）

| 检查 | 结果 |
|---|---|
| 基准管线 | host tsx+pngjs：清单/夹具/逐图/联系表/报告 全就绪，可复跑 |
| 校验脚本 | 样本/结果/缺失/透明通道/耗时一致；clean=OK exit0 |
| 反向验证 | 注入损坏图→validate exit3(RED)；重建清单→OK(GREEN) |
| on-device 探针 | onnxruntime-react-native 集成+基准页；真机延迟待重编+真模型 |
| 真图门槛 | **未测**（无真图）→ 卡片 BLOCKED，不标最终验收 |

证据：`scripts/evidence/MVP-002/INDEX.md`

## MVP-001 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 7 suites / 37 passed / 0 skipped |
| `pnpm lint` | 0 errors |
| 添加→网格→详情→编辑 | 真机断网通过，截图齐 |
| 重启持久 | force-stop+重启 FinalEdited 仍在（镜像回灌） |
| RED→GREEN | 哨兵注入失败→UI 报错+无孤儿+无半条；移除→成功 |
| 持久方案 | expo-sqlite 会话引擎 + file-system 镜像（B-4 设备适配） |

证据目录：`scripts/evidence/MVP-001/INDEX.md`

## MVP-004 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 11 suites / 69 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |
| ONB-01..07 真机截图 | 齐（`scripts/evidence/MVP-004/onb-01..07-*.png`） |
| 12 件首套只含真实衣物 | 是（id `019fa67a-...` 真实录入；理由 `含真实上装+下装 / 含鞋 / 含外套`） |
| 配额进度 0→6→12 | 真机逐件更新（含连衣裙顶替逻辑） |
| 途中 force-stop 重启恢复 | quota 步骤恢复（`onb-05-restart-recovery.png`） |
| 二次启动直达今日页 | 是（`onb-07-restart-direct-today.png`，未走 onboarding） |
| 反向验证 | host 测试「12 件但无鞋 → missing=['shoes']，补鞋后 ok=true」覆盖 |
| 原图不覆盖 | `addOriginalOnly` 仅存原图+sha256，无蒙版写入 |
| 持久方案 | expo-sqlite meta 表 + 镜像 v2（B-4 兜底） |

## MVP-005 验收结果（ACCEPTED）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 12 suites / 88 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |
| TDY-01/02/06 真机截图 | 齐（`scripts/evidence/MVP-005/tdy-01/02/06-*.png`） |
| 12 件合法衣橱可复现推荐 | 是（纯函数+确定性排序：久未穿→次数少→id 兜底） |
| reason_codes 可追溯 | 是（OCCASION_COMMUTE/FRESH_NEW/SLOT_FILLED_OUTER，仅来自真实命中规则） |
| 记录原子写 | wear_logs+wear_log_items 同事务；幂等（recommendation_id+date 唯一） |
| 不可用衣物排除 | laundry/dryclean/loaned/archived 不进候选（`isAvailable` 硬约束） |
| 反向验证 | RED：注释 isAvailable 过滤 → 2 测试失败；GREEN：恢复 → 88 全通过 |
| 持久化 | 镜像 v3 跨强杀恢复 recommendations+wear_logs；真机 force-stop 重启后推荐盘活不同衣物 |
| schema v3 | recommendations/recommendation_items/reason_codes/wear_logs/wear_log_items |

## MVP-003 结果（代码完整；Skia 链接已解决，真图设备复验仍 BLOCKED 见 B-3/B-5/B-6）

| 检查 | 结果 |
|---|---|
| schema v2 | cutout_jobs 状态机 + mask_strokes 操作栈 |
| 队列+处理器 | 幂等入队/顺序drain/recover/重试/跳过/进度快照，host 测试覆盖 |
| 管线 | 原子 tmp→commit、原图不覆盖、派生图可重建，host 测试覆盖 |
| 引擎 | 可替换 SegmentationEngine（stub；ONNX 待 MVP-002 注入） |
| 镜像 v2 | 含队列+操作栈，跨强杀恢复 |
| UI | batch-import(IMP-02) + cutout-editor(IMP-03/04: Skia+PanResponder 平移/缩放/笔刷/撤销/保存) |
| 质量门 | typecheck0 / lint0err / test 52/52/0 |
| 设备验证 | **部分**：本次原生重建已确认 Skia autolink；仍缺真实衣物原图/抠图结果，画布与导出需随真图补验 |

## MVP-006 结果（实现完成；真机证据 BLOCKED 见 B-7）

| 检查 | 结果 |
|---|---|
| 替换/重算 | 同槽替换保持其他 ID；整套去重；主角锁定；候选耗尽可解释 |
| 模式与反馈 | safe/fresh/hero/hurry；反馈幂等落库，软权重不覆盖硬约束 |
| 天气 | 和风优先（有 key 时）+ Open-Meteo 备用；fresh/stale/offline/no-cache；异常响应不伪造温度 |
| 隐私 | 定位只在用户主动点击后请求前台权限；拒绝后可手选城市或关闭天气 |
| 持久化 | schema/mirror v4，含 feedback_events/weather_cache；全新安装镜像目录自动创建 |
| 质量门 | typecheck0 / lint0err(17warn) / 15 suites / 105 passed / 0 skipped |
| Android | prebuild + assembleDebug 成功，505 tasks；APK 可安装启动；Skia 原生任务已执行 |
| 模拟器 | 390×844 TDY-03/04/05/08 与离线缓存降级通过 |
| 真机 | **未完成**：当前无 USB 物理 Android 手机，按任务卡不得标 ACCEPTED |

## P0 顺序

`MVP-000(✓) → 001(✓) → 002(BLOCKED 真图) → 003(代码✓/真图设备复验 BLOCKED) → 004(✓) → 005(✓) → 006(实现✓/真机证据 BLOCKED) → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014`

不得跳过依赖。任务被外部输入阻塞时，可做与其无依赖且不会造成返工的文档、测试夹具或下一卡预研，但不能把下一卡标为 `IN_PROGRESS`。

## 最近命令与结果

- `pnpm install`（hoisted，lockfile 提交）exit 0
- `pnpm typecheck|lint|test`：0 / 0err(17warn) / 105-0
- `npx expo prebuild --platform android --no-install`：成功
- Android `assembleDebug`：BUILD SUCCESSFUL，505 tasks
- MVP-006 模拟器：TDY-03/04/05/08 与离线缓存降级通过；真机待 B-7 解锁

## 恢复点

1. 读取 `PROGRESS.md`。
2. 读取本文件确认当前卡（MVP-006，BLOCKED，不激活下一卡）。
3. 读取当前卡的验收与非目标。
4. 检查工作树，保留未知改动。
5. 连接物理 Android 手机后按 `scripts/evidence/MVP-006/INDEX.md` 补验，不重复模拟器证据。

## P1 队列

- `P1-001-managed-sync.md`
- `P1-002-ios-release.md`

只有 P0 Android 发布卡验收后才允许激活 P1。
