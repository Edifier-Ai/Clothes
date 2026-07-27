# Clothes 长期执行状态

最后更新：2026-07-28  
当前阶段：P0  
当前任务：MVP-003  
状态：IN_PROGRESS（MVP-002 因无真图 BLOCKED，见 B-3/B-5；其管线/探针已就绪）

## 状态枚举

- `READY`：可以开始。
- `IN_PROGRESS`：唯一正在执行的任务卡。
- `BLOCKED`：存在需要外部输入的阻塞。
- `ACCEPTED`：验收证据完整。

## 当前任务

| 字段 | 内容 |
|---|---|
| 卡片 | `tasks/backlog/MVP-003-batch-cutout-editor.md` |
| 依赖 | MVP-001（✓）；抠图模型 MVP-002 BLOCKED→本卡用可替换 SegmentationEngine(stub) 先做队列+修边，真模型接入留接口 |
| 完成证据 | 批量队列持久+中断恢复+审核/修边 UI+原图不覆盖 |

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

## P0 顺序

`MVP-000(✓) → 001(✓) → 002(BLOCKED 真图) → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014`

不得跳过依赖。任务被外部输入阻塞时，可做与其无依赖且不会造成返工的文档、测试夹具或下一卡预研，但不能把下一卡标为 `IN_PROGRESS`。

## 最近命令与结果

- `pnpm install`（hoisted，lockfile 提交）exit 0
- `pnpm typecheck|lint|test`：0 / 0err / 37-0
- 真机：add/edit 跨 force-stop 持久；RED-GREEN 哨兵验证

## 恢复点

1. 读取 `PROGRESS.md`。
2. 读取本文件确认唯一当前卡（MVP-002）。
3. 读取当前卡的验收与非目标。
4. 检查工作树，保留未知改动。
5. 从“下一步”继续，不重复已留证据的工作。

## P1 队列

- `P1-001-managed-sync.md`
- `P1-002-ios-release.md`

只有 P0 Android 发布卡验收后才允许激活 P1。
