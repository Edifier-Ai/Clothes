# MVP-007 验收证据索引：搜索、筛选、编辑、状态和历史维护真实衣橱

验收日期：2026-08-01（真机 10c1b57d OnePlus LE2120 / Android 14）
任务卡：`tasks/backlog/MVP-007-wardrobe-management.md`

## 质量门（终态，`green-quality-gate.txt`）

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | exit 0 |
| `jest` 全量 | 30 suites / 236 passed / 0 skipped |
| `expo lint` | 0 errors / 9 warnings（与既有基线持平） |

本卡新增测试（均为先红后绿）：`search.test.ts`（9）、`status.test.ts`（10）、`batch.test.ts`（6）、
`stats.test.ts`（7）、`perf.test.ts`（1）、`garmentsDao.test.ts` 镜像状态事件往返（+1）、
`OtherTabsScreen.test.tsx` / `TodayScreen.test.tsx` 组件覆盖（筛选面板、批量栏、穿后面板）。

## 反向验证（故意破坏 → 红灯 → 还原 → 绿灯）

| 破坏 | 红灯证据 | 还原后 |
|---|---|---|
| RED-BREAK-1：`dao.replaceAll` 注释掉 statusEvents 回灌 | `red-break-1-mirror-status-events.txt`：状态事件镜像往返测试失败（`Expected ["laundry","archived"], Received []`） | 恢复后 236 全绿 |
| RED-BREAK-2：`batchUpdateGarments` 去掉事务包裹（写入阶段失败无回滚） | `red-break-2-batch-no-transaction.txt`：归档衣物改状态中途失败 → g1 被改成 laundry（`Expected "clean", Received "laundry"`），半数衣物被改实锤 | 恢复后全绿 |

注：RED-BREAK-2 暴露出「中途 ghost 失败」旧用例只靠预校验通过、并不能证明事务有效；
为此新增 `batch.test.ts`「写入阶段失败（归档衣物改状态），事务回滚无半成品」用例，先绿（有事务）后红（无事务）。

## 300 件夹具性能（`perf-300.txt`，host better-sqlite3 真实建库）

- seed 300 件 + 100 条穿着记录：约 1.0–1.3s（一次性夹具成本）；
- 网格数据装配 build≈4–5ms、组合筛选 filter≈0ms、排序 sort≈0ms、搜索 search≈0ms，总耗时 ≤5ms，
  远低于卡内 500ms 阈值；断言失败即红（阈值未修改）。

## 真机截图（CLS-01 ~ CLS-08、TDY-07）

| 场景 | 文件 | 内容 |
|---|---|---|
| 启动 | `00-launch.png` | 应用启动 |
| CLS-01 衣橱网格 | `cls-01-grid.png` | 27 件衣物双列网格（缩略图/名称/类别·状态） |
| CLS-02a 筛选面板 | `cls-02a-filter-panel.png` | 状态/类别/穿着/排序组合筛选 + 清空筛选 |
| CLS-02b 组合筛选命中 | `cls-02b-filtered-laundry.png` | 状态=待洗，命中 1 件 |
| CLS-02c 无结果保留条件 | `cls-02c-empty-keep-filter.png` | 待洗+鞋 0 件，条件保留 + 一键清空入口 |
| CLS-03a/b 详情与真实统计 | `cls-03a-detail-before.png` / `cls-03b-detail-stats.png` | 穿着次数/最近时间/成本次口径说明/购买日，全部来自真实数据 |
| CLS-04 编辑 | `cls-04a-edit-form.png` / `cls-04b-edit-filled.png` / `cls-04c-after-save.png` | 名称/颜色/季节/场景/品牌/备注/价格/购买日编辑保存 |
| CLS-05 状态流转 | `cls-05-status-laundry.png`（本轮补拍） | 干净 → 待洗即时生效 |
| CLS-06 状态历史 | `cls-06-status-history.png` / `cls-06b-history-after-restart.png`（本轮补拍） | 6 条带时间戳事件（含归档/恢复）；**force-stop 重启后完整保留** |
| CLS-07 批量操作 | `cls-08c-batch-restore.png` | 归档区多选「已选 1 件 → 恢复」批量栏（批量状态/标签同事务，host 测试覆盖） |
| CLS-08 归档与恢复 | `cls-08a-archived-detail.png` / `cls-08b-archive-zone.png` / `cls-08c-batch-restore.png` | 归档详情「恢复到衣橱」、归档区、批量恢复；历史完整保留 |
| TDY-07 穿后洗护 | `tdy-07a-panel.png` / `tdy-07b-after-record.png` / `tdy-07c-panel-scrolled.png` | 记录已穿后逐件「待洗/干洗/保持干净/跳过」，默认跳过；全部跳过/完成 |

`cls-05-06-status-history.png` 为上一会话滚动前所拍（内容与 cls-03b 重复），由本轮补拍的
`cls-05-status-laundry.png` / `cls-06-status-history.png` / `cls-06b-history-after-restart.png` 取代其证明力，保留不删。

## 验收标准逐条核对

| 卡内标准 | 证据 |
|---|---|
| 300 件下网格/搜索/筛选响应、结果准确 | `perf-300.txt` + search.test.ts 组合交集/归档排除/久未穿用例 |
| 归档从默认列表和推荐移除，恢复后历史与造型引用完整 | status.test.ts 归档/恢复用例；batch.test.ts「批量归档…恢复后衣物与历史完整」（wear_logs 保留）；`recommend/index.ts` isAvailable 排除 archivedAt（MVP-005 RED→GREEN） |
| 成本/次只在价格与次数有效时计算并显示口径 | stats.test.ts（19900/2=9950、除断取整、null 口径）；cls-03b 截图口径文案 |
| 穿后状态更新立即影响下一次推荐 | 机制：applyPostWearCare 置 laundry/dryclean → `isAvailable` 硬约束排除（MVP-005 反向验证覆盖同一路径）；status.test.ts 穿后联动 + 跳过不篡改 + 回滚 |
| 状态变化全部有时间记录 | garment_status_events 表 + cls-06/06b 截图 + 镜像往返测试 |
| 批量部分失败整体回滚 | RED-BREAK-2 红灯实锤 + batch.test.ts 两个回滚用例 |
| 图片缺失保留元数据不崩溃 | garmentsDao.test.ts「原图缺失时记录与详情仍可读取」；imageStore.test.ts `originalExists`；详情页「私有副本未找到，记录已保留，可重新导入修复」 |

## 持久化

- schema v5：`garment_status_events`（迁移事务内，幂等）；
- 镜像 v5：`dumpAll`/`replaceAll` 含 statusEvents，兼容 v1–v4 旧镜像；
- 真机 force-stop 重启后状态历史完整（cls-06b）。

## 诚实记录（已知限制）

- 今日页「记录已穿」表单与推荐槽位仍显示衣物 UUID（MVP-005 起既有形态，当时已验收；
  穿后洗护面板显示真实名称）。建议后续卡统一改名称展示，本卡不扩范围。
- CLS-07 批量改状态/加标签的真机截图未单独拍（归档区批量恢复已拍）；批量写路径全部由
  host 事务测试 + RED-BREAK-2 覆盖。
- cls-04b 备注字段混入价格/日期文本（adb 键入落点偏差），编辑保存能力本身已由 cls-04c 与
  dao 编辑测试证明。
- 设备真机 300 件滚动帧率未测（300 件为 host 夹具；真机衣橱 27 件滚动流畅）。
- logcat 会话期间无 FATAL EXCEPTION / AndroidRuntime / ReactNativeJS 错误。
- `device-mirror-backup-v4.json`：上一会话动归档/状态前的 v4 镜像备份（回滚用，非验收产物）。
- `ui.sh`：真机取证辅助脚本（截屏/文本点击/中文键入）。
