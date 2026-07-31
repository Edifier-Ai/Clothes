# PROGRESS

状态：MVP-005 ACCEPTED；MVP-006 IN_PROGRESS
当前任务：MVP-006
最后更新：2026-07-30

## 开工回执（MVP-000/001）

- 理解的目标：Android 优先、离线、无账号智能衣橱；12 件导入→端侧抠图修边→可解释推荐→记录→持久→导出。
- 实施顺序：严格按 ROADMAP 000→014。
- 当前基线：Node v24.18 / pnpm 11.17 / JDK Temurin17（系统默认21亦可）/ SDK34-36 / 真机 OnePlus LE2120 / 模拟器 WHPX。typecheck0 / test37-0 / lint0err。
- 最大风险：端侧 ONNX 抠图在中端机的性能/边缘（MVP-002 待验）；expo-sqlite 本机不 fsync 已用文件镜像兜底（B-4）。

## 已完成

- MVP-000 ACCEPTED：骨架+四标签+tokens+构建+真机启动+响应矩阵基线。
- MVP-001 ACCEPTED：版本化 SQLite/Drizzle schema+DAO+异步 service+衣橱/详情/编辑 UI；
  **持久化**用 expo-file-system JSON 镜像兜底（B-4：expo-sqlite 本机提交不 fsync，文件写持久）。
  真机断网闭环：添加→网格→详情→编辑→**force-stop 重启仍在**；RED-GREEN 反向验证（哨兵注入失败→
  UI 报错+无孤儿+无半条；移除→成功）。证据 `scripts/evidence/MVP-001/INDEX.md`。
  关键决策（凭证据替换/补充 TECH_STACK 的持久实现）：因 expo-sqlite 在本机不落盘，新增镜像层作持久事实源，
  expo-sqlite 仍作会话查询引擎，满足「本地 SQLite」+「数据不丢」。

## 最近一次验证（MVP-001 终检）

- typecheck0；test 37/37/0；lint 0err。
- 真机：FinalEdited 跨 force-stop 重启存活；RED 无孤儿/无半条。

## MVP-002（BLOCKED 无真图；管线/探针就绪）

- 可复跑 host 基准管线（tsx+pngjs）：清单格式+私有样本目录+合成夹具+逐图+联系表+报告+校验脚本。
- 反向验证：注入损坏图→validate exit3；重建清单→OK。
- on-device 探针 onnxruntime-react-native 集成+基准页（走文件/二进制）；真机延迟待重编+真模型。
- 真图缺→「≥80%/≤5%」与默认模型选择不得判定，卡片 BLOCKED（B-3/B-5）。

## 下一步（MVP-003）

- 读 `tasks/backlog/MVP-003-batch-cutout-editor.md`。
- 批量抠图队列（SQLite 持久+中断恢复）+ 审核/修边 Skia 画布 + 原图不覆盖；
  用可替换 SegmentationEngine（先 stub，真模型由 MVP-002 解锁后注入）。

## MVP-003（代码完整；抠图/修边设备验证 BLOCKED 见 B-6；纯 RN 屏已可设备验证）

- 队列+处理器+管线+镜像v2+batch-import+cutout-editor 全部实现；typecheck0/test69/lint(已提交代码0err)。
- **重要修复**：`apps/mobile/metro.config.js` 加 `resolveRequest`，native 平台把 `pngjs` 重定向到
  `src/native/pngjsStub.ts`，使主 bundle 不再遍历 pngjs 的 Node builtins(util/stream)，bundle 成功
  （2291 模块，`ReactNativeJS Running "main"`）。故**不含 Skia/pngjs 的纯 RN 屏可在真机启动验证**
  （已截 `scripts/evidence/MVP-003/device-wardrobe-postfix.png`，今日页渲染正常）。
- 仍 BLOCKED：Skia v2.10 在 SDK57 不 autolink（B-6），cutout-editor(Skia 画布) 与抠图管线
  （pngjs 在设备为 stub，运行抛错）的真机验收未完成；代码层经 host 测试覆盖。

## MVP-004（ACCEPTED —— 真机端到端验证通过）

- 域逻辑 `src/core/onboarding/index.ts` 完成且有 host 测试：配额(含连衣裙顶替)、首套 buildFirstOutfit
  (无鞋→missing 不伪造)、状态机 computeStep、parseOnboardState 容错、save/load 持久。
- `cutoutService.addOriginalOnly`：onboarding 用，存原图+sha256 无蒙版（cutout 阻塞下仍可录入 12 件）。
- dao/expoDb/sqliteTestHelper/queueTestHelper 加 getMeta/setMeta（字符串 meta，onboarding 进度持久）。
- `src/app/onboarding.tsx`：ONB-01..07 状态机驱动 UI，模块级 `Card`/`Primary` 组件，
  `useEffect` 内 `refresh().catch()` 异步链避免 react-hooks/set-state-in-effect。
- `_layout.tsx`：首启分流用 `Redirect href="/onboarding"` + `SplashScreen.preventAutoHideAsync`，
  比 `initialRouteName` 更可靠（Expo Router 推荐）；completed=true 时跳过 onboarding 直达 (tabs)。
- **真机端到端验证**（10c1b57d OnePlus LE2120）：
  - ONB-01..07 关键节点截图齐：`onb-01-welcome.png`..`onb-07-reveal.png` + `onb-07-after-finish.png`
    + `onb-07-restart-direct-today.png` + `onb-05-restart-recovery.png` + `wardrobe-12-items.png`。
  - 配额进度 0→1→2→3→4→5→6（预览）→11→12（首套）逐件更新，配额顶替与缺项提示与 host 测试一致。
  - 12 件首套搭配只含真实录入衣物（id 形如 `019fa67a-...`），理由 `含真实上装+下装 / 含鞋 / 含外套`
    与 `buildFirstOutfit.reasons` 一致。
  - 途中 force-stop 重启恢复到 quota 步骤（`onb-05-restart-recovery.png`）。
  - 完成后 force-stop 重启直达今日页（`onb-07-restart-direct-today.png`），未再走 onboarding。
  - 衣橱页显示「12 件衣物」，与配额完成数一致。
- **反向验证**：host 测试 `index.test.ts`「12 件但无鞋 → ok=false missing=['shoes']，补鞋后 ok=true」
  覆盖"不伪造完整搭配且提示补鞋"验收点；状态机 0/5/6/11/12 件边界覆盖。

## MVP-005（ACCEPTED —— 今日决策闭环真机验证通过）

- 推荐引擎 `src/core/recommend/index.ts`：纯函数 + 确定性排序（久未穿→次数少→id 兜底）；
  硬约束过滤（laundry/dryclean/loaned/archived 不进候选）；合法槽位组合（top+bottom+shoes 标准，
  dress+shoes 顶替，outerwear 可选）；版本化 reason_codes 仅来自真实命中规则；
  topReasons 提取最重要 2-3 条 + REASON_LABEL 中文文案映射。
- 穿着记录 `src/core/recommend/wearLog.ts`：recordWear 幂等（recommendation_id+date 唯一），
  原子写 wear_logs+wear_log_items；listWearLogs + getWearStats 聚合 lastWornAt/timesWorn。
- schema v3：recommendations/recommendation_items/reason_codes/wear_logs/wear_log_items 表 + 索引。
- 镜像 v3：`mirror.ts` 扩展持久化推荐和穿着记录，跨强杀恢复。
- TodayScreen UI：加载→空状态→推荐搭配（OutfitCard：槽位/理由/场景选择/就穿这套）→
  记录表单（RecordingForm：搭配明细/场景/舒适度/取消/完成记录）→ 已提交（✓/查看下一套）。
- **真机端到端验证**（10c1b57d OnePlus LE2120）：
  - TDY-01：12 件真实衣物推荐（id `019fa678-...` 系列）+ 3 条理由（通勤场景/新衣物首次出场/外套已就位）。
  - TDY-02：理由内联展示，可追溯到 OCCASION_COMMUTE / FRESH_NEW / SLOT_FILLED_OUTER。
  - TDY-06：记录已穿表单 → 完成记录 → ✓ 已记录今日穿着。
  - 持久化：记录已穿 → force-stop → 重启 → 推荐盘活不同衣物（已穿件 timesWorn+1 排序降低）。
- **反向验证**：注释 `isAvailable` 硬约束过滤 → 2 测试红灯（laundry 鞋进入候选 / 排序错误）；
  恢复 → 88 测试绿灯。
- 质量门：typecheck0 / lint 0err(17warn) / test 12 suites/88 passed/0 skipped。
- 证据：`scripts/evidence/MVP-005/INDEX.md`

## 下一步（MVP-006）

- 读 `tasks/backlog/MVP-006-*.md`。
- 替换单品、天气网络请求（可选降级）、个性化模式（稳妥/新鲜/主角单品/赶时间）。

## MVP-006 开工基线（2026-07-30）

- 已激活唯一任务卡 `MVP-006-replacement-feedback-weather.md`。
- 保留 MVP-005 未提交成果；独立 Git 根确认为 `C:/Users/Admin/Desktop/Projects/Clothes`。
- 质量门：typecheck 0；12 suites / 88 passed / 0 skipped；lint 0 errors / 17 warnings。
- 实施顺序：领域规则与失败测试 → SQLite/镜像持久化 → 今日页 TDY-03/04/05/08 → 离线与反向验证。

## MVP-006 领域规则（2026-07-30）

- RED：新增 replacement/feedback/weather 三组测试时因实现模块不存在，3 suites 失败。
- GREEN：3 suites / 12 passed / 0 skipped。
- 已覆盖：同槽可用候选、其余槽位 ID 不变、候选耗尽、组合去重、主角锁定、反馈软权重不越过硬约束。
- 已覆盖：天气缓存新鲜/过期、离线无缓存、超时保留缓存、前台定位拒绝、和风错误格式拒绝并降级。
- schema v4 已定义 `feedback_events`（幂等键）与 `weather_cache`；待补镜像与 UI。

## MVP-006 持久化与今日页交互（2026-07-30）

- schema v4 + 镜像 v4 已接通 `feedback_events`、`weather_cache`，兼容读取 v1-v3 镜像。
- 新增和风天气适配器（有 key 时首选）、Open-Meteo 可替换备用；错误格式拒绝，缓存过期/超时/离线明确降级。
- `expo-location` 仅配置前台权限；代码只在点击“使用当前位置”后调用，不含后台定位。
- TDY-03/04/05/08 已接入今日页：只换槽位、整套去重/主角锁定/跳过原因、四种模式、手选城市/仅本次/无天气。
- UI+领域定向验证：4 suites / 24 passed / 0 skipped；待跑完整质量门与真机截图/离线录屏。

## MVP-006 质量门、原生构建与模拟器取证（2026-07-30）

- 全量质量门：
  - TypeScript：通过，0 错误；
  - Jest：15 个套件、105 个测试全部通过，0 skipped；
  - ESLint：0 错误，保留 17 条既有 warning；
  - 天气异常/缺字段响应反向验证已由 `weather.test.ts` 覆盖，异常响应不会伪造温度。
- Android 原生链路：
  - `npx expo prebuild --platform android --no-install` 完成；
  - Gradle Debug 构建成功，505 个任务完成；
  - 构建过程包含 `shopify_react-native-skia` 原生任务，原 Skia autolink 阻塞已解除；
  - APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
- 设备交互（390×844 Android 模拟器）：
  - 已验证 TDY-03 单槽替换仅改变目标槽位；
  - 已验证 TDY-04 整套重算、主角锁定和跳过原因；
  - 已验证 TDY-05 四种模式；
  - 已验证 TDY-08 定位权限仅在主动点击时出现、拒绝后手选城市、无天气路径与缓存状态；
  - 已在应用保持运行、关闭 Wi-Fi/移动数据的条件下录制缓存可用、当前搭配不消失的降级证据。
- 持久化复验：
  - schema/mirror 版本均为 v4；
  - 镜像包含 12 件测试衣物、3 条去重反馈事件和 1 条 Open-Meteo 上海天气缓存；
  - 修复了全新安装首次写镜像时根目录不存在的问题。
- 未验收原因：
  - 当前没有 USB 物理 Android 手机；任务卡要求真机截图和离线录屏；
  - 模拟器证据不能冒充真机证据，因此 MVP-006 进入 `BLOCKED`，MVP-007 暂不激活；
  - 完整证据与真机复验步骤见 `scripts/evidence/MVP-006/INDEX.md`。
