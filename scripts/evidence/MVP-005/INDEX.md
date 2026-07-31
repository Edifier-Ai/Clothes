# MVP-005 证据目录

## 质量门

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 12 suites / 88 passed / 0 skipped |
| `pnpm lint` | 0 errors / 17 warnings（可接受） |

## 真机截图（OnePlus LE2120, 10c1b57d）

| 文件 | 页面 | 说明 |
|---|---|---|
| `tdy-01-default.png` | TDY-01 今日默认页 | 12 件真实衣物推荐搭配 + 3 条理由 + 场景选择 + 就穿这套按钮 |
| `tdy-02-reasons.png` | TDY-02 推荐理由 | 理由内联展示：通勤场景 / 新衣物首次出场 / 外套已就位（追溯 reason_codes） |
| `tdy-06-record.png` | TDY-06 记录已穿 | 搭配明细 + 场景选择 + 舒适度反馈 + 取消/完成记录 |
| `tdy-06-submitted.png` | 提交后状态 | ✓ 已记录今日穿着 + 查看下一套 |
| `tdy-restart-recovered.png` | 强杀重启恢复 | 穿着记录持久化，推荐盘活不同衣物（已穿件 timesWorn+1） |

## 关键验证

### 1. 硬约束过滤
- 12 件合法衣橱产生推荐：上装/下装/鞋/外套均含真实 ID（`019fa678-...` 系列）
- 理由来自真实命中规则：`OCCASION_COMMUTE` / `FRESH_NEW` / `SLOT_FILLED_OUTER`

### 2. RED→GREEN 反向验证
- **RED**：注释 `isAvailable` 的 `HARD_CONSTRAINT_STATUSES` 过滤 → 2 个测试失败
  - `clean 衣物进候选；laundry/dryclean/loaned/archived 不进`：laundry 的 b1 未被排除
  - `反向验证：已推荐鞋设为 laundry → 下一次排除`：laundry 鞋仍进入候选，r2.ok=true 而非 false
- **GREEN**：恢复过滤 → 88 个测试全部通过

### 3. 幂等记录（host 测试覆盖）
- 同 `recommendationId + date` 重复提交：`inserted=false`，记录数仍为 1
- 不同日期可分别记录：2 条独立 wear_log

### 4. 持久化（真机验证）
- 记录已穿 → force-stop → 重启
- 穿着记录存活（推荐结果变化：已穿件 timesWorn+1 → 排序降低 → 盘活其他件）
- 镜像 v3 跨强杀恢复 recommendations + wear_logs

### 5. 无解场景（host 测试覆盖）
- 缺鞋 → `ok=false, missing=['shoes']`，不伪造
- 缺 top+bottom（无 dress）→ `missing=['top','bottom']`
