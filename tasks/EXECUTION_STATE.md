# Clothes 长期执行状态

最后更新：2026-07-28  
当前阶段：P0  
当前任务：MVP-005  
状态：MVP-004 ACCEPTED；MVP-005 待激活（MVP-002 真图缺 BLOCKED；MVP-003 代码完整、设备验证因 Skia 不 autolink BLOCKED，见 B-3/B-5/B-6）

## 状态枚举

- `READY`：可以开始。
- `IN_PROGRESS`：唯一正在执行的任务卡。
- `BLOCKED`：存在需要外部输入的阻塞。
- `ACCEPTED`：验收证据完整。

## 当前任务

| 字段 | 内容 |
|---|---|
| 卡片 | `tasks/backlog/MVP-005-today-decision.md` |
| 依赖 | MVP-004（✓ ACCEPTED） |
| 完成证据 | 12 件合法衣橱稳定可复现推荐 + reason_codes 可追溯 + 记录原子写 + 重复提交幂等 + 不可用衣物排除 |

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

## MVP-003 结果（代码完整；设备验证 BLOCKED 见 B-6）

| 检查 | 结果 |
|---|---|
| schema v2 | cutout_jobs 状态机 + mask_strokes 操作栈 |
| 队列+处理器 | 幂等入队/顺序drain/recover/重试/跳过/进度快照，host 测试覆盖 |
| 管线 | 原子 tmp→commit、原图不覆盖、派生图可重建，host 测试覆盖 |
| 引擎 | 可替换 SegmentationEngine（stub；ONNX 待 MVP-002 注入） |
| 镜像 v2 | 含队列+操作栈，跨强杀恢复 |
| UI | batch-import(IMP-02) + cutout-editor(IMP-03/04: Skia+PanResponder 平移/缩放/笔刷/撤销/保存) |
| 质量门 | typecheck0 / lint0err / test 52/52/0 |
| 设备验证 | **部分**：metro pngjs→stub 重定向后纯 RN 屏可真机启动（见 MVP-003 evidence）；Skia 画布/抠图管线仍 B-6 阻塞 |

## P0 顺序

`MVP-000(✓) → 001(✓) → 002(BLOCKED 真图) → 003(代码✓/设备BLOCKED) → 004(✓) → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014`

不得跳过依赖。任务被外部输入阻塞时，可做与其无依赖且不会造成返工的文档、测试夹具或下一卡预研，但不能把下一卡标为 `IN_PROGRESS`。

## 最近命令与结果

- `pnpm install`（hoisted，lockfile 提交）exit 0
- `pnpm typecheck|lint|test`：0 / 0err / 69-0（含 onboarding 域逻辑 6 测试）
- 真机 MVP-004：ONB-01..07 截图齐；12 件首套含真实衣物；force-stop 重启恢复 quota；二次启动直达今日页

## 恢复点

1. 读取 `PROGRESS.md`。
2. 读取本文件确认唯一当前卡（MVP-005）。
3. 读取当前卡的验收与非目标。
4. 检查工作树，保留未知改动。
5. 从“下一步”继续，不重复已留证据的工作。

## P1 队列

- `P1-001-managed-sync.md`
- `P1-002-ios-release.md`

只有 P0 Android 发布卡验收后才允许激活 P1。
