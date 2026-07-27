# Clothes 长期执行状态

最后更新：2026-07-28  
当前阶段：P0  
当前任务：MVP-002  
状态：IN_PROGRESS

## 状态枚举

- `READY`：可以开始。
- `IN_PROGRESS`：唯一正在执行的任务卡。
- `BLOCKED`：存在需要外部输入的阻塞。
- `ACCEPTED`：验收证据完整。

## 当前任务

| 字段 | 内容 |
|---|---|
| 卡片 | `tasks/backlog/MVP-002-segmentation-benchmark.md` |
| 依赖 | MVP-001（已 ACCEPTED） |
| 完成证据 | 模型基准报告（可用率/失败率/耗时/连续12张）+ 真图或夹具来源记录 |

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

`MVP-000(✓) → 001(✓) → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014`

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
