# MVP-011 证据索引

ACCEPTED —— 2026-08-02

## 质量门

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 63 suites / 481 passed / 0 failed（洞察：core 2 suite / 37 用例 + UI 外壳 1 suite / 6 用例 + 衣橱入口断言 1 用例） |
| `pnpm lint` | 0 errors / 9 warnings（基线持平） |

输出：
- `green-insights.txt`（core 2 suite 37 用例 GREEN）
- `red-break-archive.txt`（上一会话：变异归档过滤 → 2 测试红，还原绿）
- `red-break-cost-per-wear.txt`（本轮：变异 0 次也按 1 次算虚假成本 → 3 测试红，还原绿）

## 实现要点

- **领域层（上轮预研）**：`src/core/insights/metrics.ts` 5 纯函数 + `metrics.test.ts` 23 用例
- **DB 适配层**：`src/core/insights/insightsService.ts` 双 db 模式（`db: GarmentDb` 调 dao；`statsDb: AnyDb` 调 wearLog.listWearLogs）；`assembleFacts` 过滤墓碑 items；`getOverviewCore/getIdleReportCore/getCostPerWearListCore/getMonthlyReportCore` 可注入；设备单例 `getOverview/getIdleReport/getCostPerWearList/getMonthlyReport` 不写镜像（实时算）
- **UI 四屏**：`InsightsScreen`（STA-01 总览：穿着天数/盘活单品/重复率/衣橱构成/学习期提示/三入口）、`IdleGarmentsScreen`（STA-02 久未穿：30/60/90 分桶+新录入未穿）、`CostPerWearScreen`（STA-03 成本/次：按价值排序，0 次/无价显原因不显假数）、`MonthlyReportScreen`（STA-04 月度报告：月切换+脱敏分享预览）
- **视图 helpers**：`insightsView.ts` 集中格式化（价格÷100、重复率×100%、久未穿天数、成本/次 null 给原因）
- **路由**：4 路由 `app/insights.tsx` / `insights-idle.tsx` / `insights-cost.tsx` / `insights-monthly.tsx`，从 `WardrobeScreen` 顶部「洞察」按钮入口（哑金边框与「+ 添加」酒红主操作区分）
- **外壳测试**：`features/insights/InsightsScreens.test.tsx` mock insightsService 单例，验证四屏标题/空态/学习期/正常态 KPI/月度分享展开无泄漏告警

## 反向验证（RED-BREAK）

### 1. 归档过滤（`red-break-archive.txt`）

变异 `computeIdleReport` 第 257 行 `if (g.archivedAt != null) continue;` 注释掉：
- `metrics.test.ts:176` 期望 `idle90=['g7']` 实得 `['g7','g8']`（g8 归档 95 天泄漏）
- `insightsService.test.ts:208` 期望 `g2 undefined` 实得 `{daysSinceLastWorn:100, idleThreshold:90, kind:'idle'}`（归档 g2 进入 idle90）

2 测试红，还原后 37 全绿。

### 2. 成本/次 0 次虚假计算（`red-break-cost-per-wear.txt`）

变异 `computeCostPerWearList` 第 314 行 `computeCostPerWear(g.priceMinor, timesWorn)` → `computeCostPerWear(g.priceMinor, Math.max(1, timesWorn))`，让 0 次也按 1 次算：
- `metrics.test.ts:228` 期望顺序 `['g1','g5','g8','g7','g3','g2','g4','g6']` 实得 `['g1','g5','g8','g7','g4','g3','g2','g6']`（g4 0 次产生虚假 30000 成本/次，排序窜到第 5 位）
- `metrics.test.ts:244` 期望 g4 costPerWearMinor=null 实得 30000
- `insightsService.test.ts:314` 期望 g1 costPerWearMinor=null 实得 9900

3 测试红，还原后 37 全绿。

## 真机验证（OnePlus LE2120 / com.clothes.app / dev build via metro）

| 截图 | 内容 |
|---|---|
| `sta-00-wardrobe-final.png` | 衣橱页顶部「洞察」+「+ 添加」两按钮并存 |
| `sta-01-overview.png` | STA-01：学习期提示 / KPI 2 穿着天数·10 盘活单品·20% 重复率 / 衣橱构成 27 总·27 可穿·0 归档·3 总穿着·平均 0.3 / 三入口 |
| `sta-02-idle.png` | STA-02：录入后未穿 17 件 + 「为它搭一套」入口 |
| `sta-03-cost.png` | STA-03：按价值排序，0 次/无价显「未填价格」「穿 N 次」原因 |
| `sta-04-monthly.png` | STA-04：2026-08 / 1 穿着天数·1 总次数·4 盘活单品·2 新组合 / 分享按钮 |
| `sta-04-share.png` | STA-04：脱敏分享快照展开（不含原图/价格/备注/定位） |
| `sta-restart-01-wardrobe.png` | force-stop 重启 → 衣橱页 |
| `sta-restart-02-overview.png` | 重启后 STA-01：2 穿着天数·10 盘活单品·20% 重复率（与重启前零漂移） |

## 镜像终态（`sta-mirror-final.json`）

- 版本 v8（沿用 MVP-010，未改 schema）
- garments 27 / wearLogs 3 / wearLogItems 12
- 与 STA-01 显示的「27 总单品 / 3 总穿着次数」吻合，证明 insightsService 实时算与镜像事实源一致

## 验收对照

| 任务卡验收 | 证据 |
|---|---|
| 固定夹具所有指标能手工复算，页面口径与代码一致 | STA-01 显示与 metrics.test.ts 23 用例 + insightsService.test.ts 14 用例固定夹具一致 |
| 编辑/删除一条穿着记录后相关指标同步更新 | insightsService 实时算不写镜像，从 wear_logs/garments 装配；core 测试覆盖归档/墓碑/0 次/学习期边界 |
| 归档衣物保留历史贡献，但默认不进入当前可穿库存 | STA-01「已归档 0」（当前无归档）；RED-BREAK-1 归档过滤实锤 |
| 脱敏分享产物不包含受保护字段 | STA-04 分享预览无原图/价格/备注/定位；`hasProtectedLeak` 兜底 + 测试 |
| 0 次无价格不出现除零/NaN/虚假成本 | STA-03 显「未填价格」；RED-BREAK-2 0 次虚假计算实锤 |
| STA-01..04 真机截图 | 6 张真机截图 + 2 张重启持久截图 |
