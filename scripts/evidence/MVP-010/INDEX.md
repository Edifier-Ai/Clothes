# MVP-010 旅行打包（TRP-01..06）证据索引

验收日期：2026-08-02。设备：OnePlus LE2120（serial `10c1b57d`，Android 14，Metro dev-client，`adb reverse tcp:8081 tcp:8081`）。

## 质量门

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0（`green-tsc.txt`） |
| `npx jest --silent` | 61 suites / 461 passed / 0 failed（`green-quality-gate.txt`，MVP-009 基线 56/400 → +5 suite/+61 test，含 MVP-011 预研 23 test） |
| `npx expo lint` | 0 errors / 9 warnings（`green-lint.txt`，与 MVP-009 基线持平，MVP-010 新增代码 0 warning） |

旅行三 suite 单独：`green-trip-suites.txt` —— `packView`/`tripService`/`packingService` 3 suite / 35 passed / 0 failed。

## RED → GREEN

- `red-trip-services.txt`：实现前 `core/trip/{tripService,packingService,packView}` 三模块不存在，3 suite 因 `Cannot find module` 全部失败，exit=1。
- `green-trip-suites.txt`：实现后三 suite 35 用例全绿。
- `red-break-source-count.txt`（反向验证）：变异 `computePackingFromOutfits` 让同一件鞋的 `sourceCount` 退化为 1（不累加多套来源）→ 9 测试失败，含任务卡锚点用例「五天十套同一件鞋 → 一项 + 来源数 10」期望 10 实得 1、删除某日造型重算来源数期望 2 实得 1、勾选保留重算期望来源数 2 实得 1；还原后全绿。

覆盖点：
- 旅行 CRUD（保存/读取/列表/状态推进/墓碑删除/不存在容错）；
- 每日造型安排（关联造型快照 vs 临时组合、occasion/note 可空、编辑回填）；
- 造型墓碑后 `lookMissing=true` 且快照保留（修复入口依据）；
- 记录已穿幂等（`completed`/`changed` 再记录原样返回不改 `wornCompletedAt`）；
- 打包去重（同一件衣物多套只一项）+ 来源计数（被几套使用）+ 来源 ID 可追溯；
- 手工项目（kind=`manual`）不被重新生成覆盖或删除；
- 删除某日造型后重算：来源计数更新、仍存在项的勾选状态保留；
- 勾选状态与衣物事实分离（勾选不篡改 garments 表，仅落 `packing_items.checked`）；
- 复盘「未穿」只依据 `wornStatus` 实际记录，不依据 `checked`；
- 模板保存（`trip_templates` 表，本卡仅落库与基本读取，UI 复用「保存模板」按钮入口）；
- 镜像 v8 往返（四表随 `GarmentDump` 进 `dumpExtra/restoreExtra`，兼容读 v1–v7）。

## 真机截图（TRP-01..06 + 重启持久 + 镜像 v8）

| 文件 | 内容 |
|---|---|
| `trp-00-launch.png` | App 启动后落地今日页（验证未破坏 MVP-005 主链路） |
| `trp-00-plan-entry.png` | 计划页底部「旅行」入口（PlanScreen 旅行入口接入） |
| `trp-01-trips-empty.png` | TRP-01 空态：标题「旅行」+ 副标题 + 空盒「还没有旅行」+ 主操作「新建旅行」 |
| `trp-02-new-trip-form.png` | TRP-02 新建旅行表单：名称/目的地/开始-结束日期步进/时区 chips/活动添加 |
| `trp-03-overview-fresh.png` | TRP-03 旅行总览（刚创建无安排）：基本信息卡 + 状态徽章 + 「打包清单」「复盘」入口 + 每日空安排 |
| `trp-03-overview.png` | TRP-03 总览含已安排造型：每日造型缩略图行 + 状态切换 + 编辑/删除 |
| `trp-04-day-plan.png` | TRP-04 当日安排：添加安排表单（时间段 chips/场合 chips/选择造型 vs 临时组合/备注） |
| `trp-04-day-outfit1.png` | TRP-04 第一套造型（白天·关联造型 R5Canvas5，5 件单品快照缩略图） |
| `trp-04-day-two-outfits.png` | TRP-04 同日两套：白天 + 晚餐（同一造型重复利用 → 验收锚点） |
| `trp-04-day-one-worn.png` | TRP-04 只记录白天已穿：白天卡「已穿」徽章、晚餐保持 planned |
| `trp-05-packing-list.png` | TRP-05 打包清单：5 件衣物每件 sourceCount=2 + 来源套数显示 |
| `trp-05-packing-dedup.png` | TRP-05 去重证明：两套造型都用同一 5 件 → 清单只 5 项（不是 10 项）|
| `trp-05-packing-checked.png` | TRP-05 勾选首项：「已勾选 1 · 未勾选 4」，勾选状态独立于衣物事实 |
| `trp-06-review.png` | TRP-06 旅行复盘：实际穿着（白天 completed）+ 计划未穿（晚餐 planned，依据 wornStatus 不依据 checked） |
| `trp-06-review-updated.png` | TRP-06 复盘含「保存模板」入口与未穿说明 |
| `trp-01-trips-with-trip.png` | TRP-01 列表含已建旅行：按状态分组卡片 + 目的地 + 日期范围 + 活动数 |
| `trp-restart-01-launch.png` | force-stop 冷启动后：App 重新进入 |
| `trp-restart-02-trips.png` | 重启后 TRP-01：旅行卡片完整保留（不丢旅行） |
| `trp-restart-03-after-launch.png` | 重启后 TRP-03：每日造型安排完整、worn 状态不漂移 |
| `trp-restart-04-packing-persisted.png` | 重启后 TRP-05：5 项清单 + 首项勾选状态完整保留（不丢勾选） |
| `trp-check-current.png` | 当前状态核对截图（取镜像前） |
| `trp-mirror-after-save.json` | 保存旅行后镜像（验证写后写镜像即时落盘） |
| `trp-mirror-v8-final.json` | 终态镜像 v8：version=8，含 trips(1)/tripOutfits(2)/packingItems(5)/tripTemplates(0) 四表 |

镜像 v8 关键字段实证（`trp-mirror-v8-final.json`）：
- `version: 8`、`updatedAt: 1785647135206`
- `trips[0]`：name=`TokyoTrip`、destination=`Tokyo`、startDate=`2026-08-02`、endDate=`2026-08-05`、timeZone=`Asia/Tokyo`、status=`planning`、activitiesJson=`[]`、weatherSnapshotJson=null（天气不可用不阻塞）
- `tripOutfits`：2 行（白天 wornStatus=`completed` wornCompletedAt=1785646897880；晚餐 wornStatus=`planned`），同一 lookId 重复利用 → 验收锚点「五天十套」的简化版本（同日两套同一造型）
- `packingItems`：5 行 kind=`garment`，每行 sourceCount=2、sourceOutfitIdsJson=`["...c5-ae69...","...cb-1856..."]` 双源可追溯；首项 `checked:1 checkedAt:1785647135164`，其余 `checked:0 checkedAt:null` → 勾选状态与衣物事实分离
- `tripTemplates`：空数组（本卡仅落库 + 入口，UI 未演练保存）

## 反向验证（RED-BREAK）

`red-break-source-count.txt`：变异 `computePackingFromOutfits` 内 `entry.sourceCount += 1` 为 `entry.sourceCount = 1`（每次见到都重置为 1，不累加多套来源）→ 9 测试失败，包含任务卡验收锚点三条：
1. 「五天十套同一件鞋 → 一项 + 来源数 10」期望 10 实得 1；
2. 「删除某日造型后重算来源计数」期望 2 实得 1；
3. 「重新生成保留仍存在项目的勾选状态」期望 sourceCount=2 实得 1。
还原后 35/35 全绿。证明去重与来源计数逻辑被测试有效抓红。

## 结论

任务卡全部验收锚点通过：

1. **五天十套造型中重复衣物只出现一次，并显示被几套使用** —— host 测试 `packingService.test.ts`「五天十套同一件鞋 → 一项 + 来源数 10」+ RED-BREAK 实锤；真机 `trp-05-packing-dedup.png` 同日两套同一造型 5 件 → 清单 5 项 sourceCount=2。
2. **清单与安排来源可追溯；手工项目不被重新生成覆盖** —— host 测试 `packingService.test.ts` 手工项目分支 + `sourceOutfitIdsJson` 双源可追溯；真机清单每项显示来源套数。
3. **中途退出、重启后安排和勾选完整** —— 真机 `trp-restart-01..04` 四张截图：force-stop 冷启动后旅行/安排/勾选状态零漂移；镜像 v8 终态四表完整落盘。
4. **复盘中的「未穿」只依据实际记录，不依据未勾选** —— host 测试 `TripReviewScreen` 复盘逻辑 + `packingService`/`tripService` wornStatus 分支；真机 `trp-06-review.png` 晚餐 planned 显「未穿」与勾选状态无关。

任务卡「必须完成」逐条对应：
- 旅行保存目的地/日期范围/时区/活动/天气快照 ✓ TRP-02 表单 + 镜像字段
- 每天允许多个造型；显示衣物重复利用和状态冲突 ✓ TRP-04 同日白天+晚餐两套
- 打包清单只根据已安排造型去重 + 手工增加生活用品 ✓ TRP-05 + host 测试 manual 分支
- 勾选状态与衣物事实分离；重新生成保留仍存在项目的勾选状态 ✓ host 测试 + 真机勾选
- 删除某日造型后重新计算来源计数，不误删手工项目 ✓ host RED-BREAK + 测试
- 复盘展示实际穿着、未穿衣物并可保存模板 ✓ TRP-06 + trip_templates 落库

状态与失败恢复：
- 天气不可用不阻塞旅行 ✓ `weatherSnapshotJson=null` 仍可保存与展示
- 造型/衣物归档时标出缺失，不静默从清单消失 ✓ `lookMissing` 标记 + 修复入口（host 测试覆盖）
- 重新生成和勾选更新幂等 ✓ host 测试幂等用例

## 诚实限制

- 「五天十套同一件鞋」终判在 host 测试（`packingService.test.ts` 真正跑 5 天 × 2 时段 = 10 套）；真机为简化版本（同日 2 套同一造型，sourceCount=2），原因是设备上构造 10 套需要重复操作 10 次且无额外覆盖价值。host 测试 + RED-BREAK 已充分证明去重逻辑。
- 「保存模板」UI 入口存在且 `trip_templates` 表已落库并随镜像 v8 持久化，但真机未演练完整「保存→在新建旅行时套用模板」闭环（任务卡非锚点，模板复用细节归后续卡）。
- 「造型归档后 lookMissing 标记 + 修复入口」由 host `tripService.test.ts` 与代码路径覆盖，真机未现场删造型演练（与 MVP-009 同样限制）。
- 「重新生成失败」与「保存失败保留表单」由代码 catch 路径覆盖（不清空表单 state），真机未注入故障。
- 真机 timezone 往返未在 MVP-010 重复（旅行日期语义沿用 MVP-009 已验证的当地日期字面量，不引入新日期数学）。
