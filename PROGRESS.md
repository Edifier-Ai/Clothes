# PROGRESS

状态：MVP-008 ACCEPTED（2 缺陷修复红→绿；五件画布重启一致；删封面冷启动重建；模拟器响应矩阵 12 张齐）
当前任务：MVP-009（计划/日历）
最后更新：2026-08-02

## 开工回执（MVP-000/001）

- 理解的目标：Android 优先、离线、无账号智能衣橱；12 件导入→端侧抠图修边→可解释推荐→记录→持久→导出。
- 实施顺序：严格按 ROADMAP 000→014。
- 当前基线：Node v24.18 / pnpm 11.17 / JDK Temurin17（系统默认21亦可）/ SDK34-36 / 真机 OnePlus LE2120 / 模拟器 WHPX。typecheck0 / test37-0 / lint0err。
- 最大风险（现役）：GoodsMatting 尚缺 100–200 张目标场景样本终判；实体 Android 当前 ADB 未授权，MVP-003/006 真机证据未补；expo-sqlite 本机不 fsync 已用文件镜像兜底（B-4）。

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

## MVP-002 旧端侧路线（历史，2026-07-31 已被 API 路线取代）

- 可复跑 host 基准管线（tsx+pngjs）：清单格式+私有样本目录+合成夹具+逐图+联系表+报告+校验脚本。
- 反向验证：注入损坏图→validate exit3；重建清单→OK。
- 当时的 on-device 探针和 ONNX 基准页已随路线变更删除；现役实现与证据见本文后续 GoodsMatting 记录及 `scripts/evidence/MVP-002/INDEX.md`。
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

## 下一步（MVP-008）

- 读 `tasks/backlog/MVP-008-look-builder.md`。
- 失败测试先行 → 实现 → 质量门 → 真机截图；执行循环同前。

## MVP-008 ACCEPTED（UI/真机复验轮 + 响应矩阵，2026-08-02）

- UI 层为上一会话产出（`src/features/looks/` 12 模块 + 3 路由 + schema v6，未记录）；
  本轮核对：typecheck 0；52 suites / 360 passed / 0 skipped；lint 0 errors / 9 warnings。
- **复验驱动修复 2 个静默缺陷**（均 RED→GREEN）：
  1. 画布比例裁切：flex 竖屏画布（≈0.76）产出的归一化几何在正方形封面（840²）上被裁。
     修：`CANVAS_ASPECT=3/4` + `fitCanvasBox`，编辑/封面合成（840×1120）/图库详情三处统一 3:4，
     缓存封面 contain 不裁切（geometry.test +5，red-canvas-aspect→green）。
  2. 编辑器↔封面图源不一致：画布/槽位卡用 96×96 方形压缩缩略图、封面用透明底预览 → 所见≠所得。
     修：`displayImagePaths` 双通道（thumb/preview），选衣候选 imageRelPath=预览通道与封面同源，
     thumbnailRelPath=缩略图通道供列表图标（displayImage.test +3，red→green）。
- 终态质量门：typecheck 0；53 suites / 368 passed / 0 skipped；lint 0 errors / 9 warnings。
- **真机终验（r5，10c1b57d）**：LOK-01~07 全截图；五件画布拖动/置底/撤销/重做（redo 与操作态
  md5 完全一致）→ 保存 → force-stop 重启 → 详情几何层级逐件一致；变体只换下装且原造型未改；
  反向验证：删 R5Canvas5 派生封面 PNG → 冷启动后图库/详情仍由事实数据实时重建，造型不丢。
- 手势录屏 lok-03-gestures.mkv（239.8s 流有效，ycgco 本机不可抽帧，同 MVP-006 限制）。
- 响应矩阵收官（2026-08-02）：模拟器 AVD Clothes2_360x800/390x844/430x932（android-35 重装镜像），
  种子镜像（55M tar 注入 files/clothes，DB 空自动恢复 6 造型）逐档截 grid/detail + 1.3× 字体共 12 张
  `lok-r6-*`，3:4 画布 contain 不裁切、字体放大无截断溢出。**MVP-008 ACCEPTED**。
- 证据：`scripts/evidence/MVP-008/INDEX.md`

## 下一步（MVP-009）

- 读 `tasks/backlog/` 中 MVP-009 任务卡（计划/日历），失败测试先行 → 实现 → 质量门 → 真机截图。

## MVP-008 进行中（领域层完成，2026-08-01）

- schema v6：`looks`（mode slots/canvas、source_look_id 变体关联、cover_rel_path、墓碑）+ `look_items`
  （归一化 x/y/scale/rotation、z_index/ord）；镜像 v6 兼容 v1–v5；DAO/service/draft 齐全。
- `src/core/looks/` 纯函数 7 模块：geometry/zorder/history（快照栈，20 连撤 20 连做）/slots 合法性/
  lookFactory（变体+克隆不可变）/cover spec（确定性、缺图占位）/draft 容错。
- 质量门：typecheck 0；40 suites / 297 passed / 0 skipped（+61）；lint 0 errors / 9 warnings。
- 决策：草稿存 meta 键 `look_draft` 不入镜像（正式造型绝不丢，草稿强杀可丢）；rotation=弧度；
  封面 spec 与槽位解耦；设备端 rebuildCoverSpec 优先抠图 preview（透明底），原图兜底。
- 待办：UI（LOK-01~07 + Skia 画布手势）→ 质量门 → 反向验证（删封面重建）→ 真机证据。

## MVP-007（ACCEPTED —— 2026-08-01 验收完成）

- 上一会话已完成实现（未记录）：`src/core/wardrobe/`（search/status/batch/stats/query/perf）+ schema v5
  `garment_status_events` + 镜像 v5 + WardrobeScreen 组合筛选/批量栏 + 详情页统计/状态/历史/归档 +
  TodayScreen PostWearPanel；本轮核对覆盖并补齐证据后验收。
- 本轮补齐：镜像状态事件往返测试（garmentsDao.test +1，先修正断言后绿）；新增批量「写入阶段失败
  （归档衣物改状态）事务回滚」用例（batch.test +1）——旧「ghost 中途失败」用例只验证预校验，
  证明不了事务；RED-BREAK-1（断镜像回灌）与 RED-BREAK-2（去事务包裹）双红灯实锤，还原后全绿。
- 质量门终态：typecheck 0；30 suites / 236 passed / 0 skipped；lint 0 errors / 9 warnings。
- 300 件夹具：build≈4–5ms / filter/sort/search≈0ms（阈值 500ms，未松动）。
- 真机补拍（10c1b57d）：CLS-05 干净→待洗即时生效、CLS-06 状态历史 6 条带时间戳、
  force-stop 重启后历史完整（cls-06b）；上轮已拍 CLS-01~04/08、TDY-07 全系列。
- 诚实限制：今日页记录表单/推荐槽位仍显 UUID（MVP-005 起既有，建议后续卡统一）；
  CLS-07 批量状态/标签真机截图未单拍（事务路径 host 覆盖）；真机 300 件滚动帧率未测。
- 证据：`scripts/evidence/MVP-007/INDEX.md`

## 2026-08-01 MVP-003 真机复验通过（ACCEPTED）

- **复验驱动修复 4 个真实缺陷**（全部 RED→GREEN）：
  1. `enqueueBatch` 漏插 garment_assets → 队列衣物详情「不存在」（设备 DB 实证 15 garments/12 assets）；
     修复：入队即提交原图到 originals/ + 落 asset 行；`cutoutService.test.ts` 先红后绿。
  2. 详情页无修边入口（cutout-editor 全工程无跳转）；加「修边」按钮，`tests/garment-detail.test.tsx` +2。
  3. 修边页 Skia 双故障：lazy 内联 require + React Compiler → `ReferenceError: Property 'Rect' doesn't exist`；
     `useImage` 对 file:// 原图真机空白。修复：`features/cutout/SkiaCanvas.tsx` 静态 import + React.lazy 动态 import；
     原图 `decodeSkImage` JSI 解码（+2 测试）。
  4. 队列中断无续跑入口（「继续处理」仅限断网）；batch-import 挂载自动续跑 + 按钮放开（+2 测试，13/13）。
  顺带：撤销计数不刷新修复；修边保存接通 `rebuildDerived` 重建预览/缩略图（此前无人调用）。
- **质量门终态**：typecheck 0；24 suites / 182 passed / 0 skipped；expo lint 0 errors / 9 warnings。
- **12 张连导 + 杀进程恢复**（10c1b57d）：succeeded 11/running 1/pending 3 时 force-stop → 重启自动续跑 →
  15/15 成功 0 失败；11 个已提交任务 updatedAt 全不变（不重做）。12 张耗时 14:26→14:29（含杀+重启）。
- **Skia 修边**：擦除/撤销（至 0 边界）/恢复/缩放/笔刷/保存全过；退出重进蒙版+操作栈一致；
  原图 sha256 `0989b73fec95…` 修边前后不变；预览 13:27→14:32 重建。录屏 `imp04-edit-session.mkv`（MKV，ffprobe 有效）。
- **诚实记录**：12 张测试照片多为非衣物图（队列机制验证，质量门槛归 MVP-002 仍 BLOCKED B-8②）；
  真机失败注入=杀进程；失败重试/跳过路径由 host 测试覆盖；`_staging/` 成功后残留 15 个暂存文件（非阻塞）。
- 数据修复：3 件孤儿衣物离线 SQL 补 asset 行（sha256 实算），镜像/DB 一致。
- 证据：`scripts/evidence/MVP-003/INDEX.md`

## 下一步（MVP-006）

- 读 `tasks/backlog/MVP-006-*.md`。
- 替换单品、天气网络请求（可选降级）、个性化模式（稳妥/新鲜/主角单品/赶时间）。

## MVP-006 开工基线（2026-07-30）

- 已激活唯一任务卡 `MVP-006-replacement-feedback-weather.md`。
- 保留 MVP-005 未提交成果；当前副本的独立 Git 根于 2026-08-01 复核为 `D:/Projects/Clothes`。
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

## 2026-07-31 方向决策：抠图改为现成分割 API（用户拍板，B 方案）

- 用户决定放弃端侧 ONNX 抠图，改用现成分割 API 作为唯一抠图路径；API 选型偏好免费额度优先；已授权修订 AGENT_GOAL/TECH_STACK/MVP-002/MVP-003。
- 已改：`AGENT_GOAL.md` 完成条件（断网闭环中抠图环节改为可排队/跳过）、`TECH_STACK.md` 第 1/2/4/8 节、MVP-002 全卡重写为 API 基准、MVP-003 队列断网语义。
- 保留的兜底机制（非端侧引擎，属录入健壮性）：持久队列、失败重试/跳过、手工修边、`addOriginalOnly` 原图入库。
- 待办：API 选型调研进行中（免费额度/隐私条款/大陆可达性对比）；选定后复跑 MVP-002 API 基准。
- 遗留：`PRODUCT_PLAN.md:273`「不建议第三方云抠图作唯一入口」与本决策冲突，该文件默认只读，待用户确认修订。
- 当时计划的技术清理现已完成：`src/native/onnxruntime-react-native.d.ts`、`segmentationProbe.ts`、`app/segmentation-benchmark.tsx` 已从现役代码删除，完成记录见下文。

## 2026-07-31 抠图选型落地：腾讯云数据万象 GoodsMatting（用户已配好账号）

- 调研：国际候选（remove.bg/Bria/fal.ai/Replicate/HF/Photoroom/Clipdrop）+ 国内候选（阿里 viapi/腾讯 CI/百度/火山/华为/PicUP/PicWish/稿定），证据含官方页面核实：腾讯免费额度 1000 次/2 个月自动发放（cloud.tencent.com/document/product/460/36381）；阿里试用中心分割抠图 1 万点/12 个月（free.aliyun.com）；阿里服饰分割按量 ¥0.008/次。
- 用户决策：先用腾讯云方案（账号/存储桶已配置）。GoodsMatting 官方接口：上传时处理 PUT+Pic-Operations，结果透明 PNG 存桶内；下载时处理 GET ?ci-process=GoodsMatting 直接返回 PNG 二进制；备选候选阿里 SegmentCloth/百度智能抠图。
- 成本测算：首月 12 张 ≈ ¥0.12，年 1200 张 ≈ ¥12，均在免费额度内。
- 凭证约定：`scripts/segmentation-benchmark/.private/tencent-ci.json`（gitignored；模板 tencent-ci.example.json）；App 侧走 expo-secure-store。
- 技术要点：COS XML API 签名（HMAC-SHA1，RN 端用纯 JS 实现）；图片客户端预压到 ≤3000px/≤3MB；处理后删除 COS 对象，照片不留云端。

## 2026-07-31 GoodsMatting 适配层落地（host 基准 + App 引擎）

- 基准侧 `scripts/segmentation-benchmark/tencentCi.ts`：`TencentCiSegmenter`（name `tencent-goods-matting`）——PUT+Pic-Operations 上传时处理 → UploadResult XML 解析 → GET 结果 PNG → alpha 通道提取（尺寸不一致最近邻采样到输入尺寸）→ DELETE 源/结果对象（尽力，失败仅警告不阻断）；凭证缺失 available=false + 写明缺什么，绝不伪造。`runBenchmark.ts` 选项改 `stub|tencent|all`；`segmenter.ts` 删除 `OnnxSegmenter` 死代码。
- 签名共用 `apps/mobile/src/native/cosSignature.ts`（纯函数零平台依赖，hmac/sha1 注入；算法逐项核对官方文档 product/436/7778，含 UrlEncode 补 ! ' ( ) *）：基准注入 Node crypto，App 默认 js-sha1（新依赖 js-sha1 + @types/js-sha1）。
- App 侧 `src/native/tencentCiEngine.ts`：`TencentCiEngine implements SegmentationEngine`；http/upload/download/writeTemp/deleteTemp 钩子可注入（默认 uploadAsync 直传源文件 + fetch 下载结果字节/DELETE）；配置异步 getConfig（业务层后续接 expo-secure-store），缺失 available=false；结果 PNG 落 cacheDirectory 临时文件经 PixelReader 解码；全程文件路径/二进制，不走 Base64 整图。
- 探针遗留删除：`segmentationProbe.ts`、`app/segmentation-benchmark.tsx`、`onnxruntime-react-native.d.ts` 及 `_layout.tsx` 路由；pngjsStub + metro 重定向保留（deviceIO/devicePixelReader/cutout-editor 仍懒 require pngjs）。
- 测试 +3 suites +28 tests：cosSignature 固定向量 Node crypto↔js-sha1 对拍；benchmark mock fetch 全流程（URL/方法/Pic-Operations/Authorization、alpha 提取、最近邻缩放、403/畸形 XML/DELETE 失败不阻断）；engine mock http+PixelReader 全流程/缩放/临时文件与 COS 对象清理/配置缺失。RED→GREEN 反向验证：3 处变异（签名 method 大小写、两处 alpha 通道偏移）→ 7 测试失败，恢复后全绿。
- 质量门：typecheck 0；test 18 suites / 133 passed / 0 skipped；lint 0 errors / 15 warnings（≤ 既有 17）。`--segmenter stub` 复跑 + validate OK；`--segmenter tencent` 无凭证时如实标 unavailable 不崩溃。
- 待用户填 `.private/tencent-ci.json` 真实凭证后复跑 `--segmenter tencent` 出真图基准。

## 2026-07-31 腾讯云 GoodsMatting 真实冒烟通过

- 凭证就位：bucket `test1-1304782807`（ap-chongqing），数据万象绑定可用；配置文件 `.private/tencent-ci.json`（gitignored）。
- 新增 `scripts/segmentation-benchmark/smokeTencentCi.ts`（1 张图真实链路冒烟）。
- 结果：`input 256x320 → SMOKE OK: e2e=686ms alpha=81920px fg=40.5%`；签名/上传/Pic-Operations/XML 解析/下载/alpha 提取/COS 删对象全链路真实验证通过。
- 质量门：typecheck 0；lint 0 errors / 15 warnings。
- B-8 阻塞①已解除；剩②样本集（公开衣物数据集+真实照片）。

## 2026-07-31 MVP-002 公开数据集基准（10 张，腾讯 GoodsMatting 实跑）

- 子清单 `.private/manifest.public10.json`：5 ModaNet（带 GT）+ 5 电商图（dress/longsleeve/pants/shoes/t-shirt 各一）；`runBenchmark`/`validateReport` 新增 `--manifest` 增量参数，校验规则未松动；validate exit 0。
- API 消耗：冒烟 1 + 基准 10 = 11 次 / 1000 次免费额度。延迟 p50 1107ms / p95 1511ms（≤8s 目标余量大）。
- 报告表象「0% 可用/70% 严重」为口径假象：5 张电商图 GT 为全零占位（IoU 恒 0），5 张 ModaNet GT 为纯衣物多边形而模型抠完整人物。
- 人工判定（已写入两个 manifest 的 humanJudgement，联系表 `.private/results/public-10/contact_sheet.png`）：
  - 代表性组（电商平铺/挂拍，最贴近用户场景）：dress/longsleeve/pants/t-shirt 4/5 直接可用，边缘干净；shoes 一双鞋只抠出一只 = 唯一真实失败模式（需手工修边补回或重拍）。n=5：80% 可用 / 20% 严重。
  - ModaNet 组：全部抠出完整人物轮廓，边缘质量高；街拍着装照非目标场景，不计入门槛。
- 结论：管线+质量信号良好，但 n=5 且含口径限制，≥80%/≤5% 终判仍待用户真实照片；MVP-002 保持 BLOCKED（B-8②），不标 ACCEPTED。
- 产品启示：成双物品（鞋/手套）存在只抠单只风险 → 审核页需提示核对，修边兜底。

## 2026-07-31 MVP-003 App 侧抠图接线完成（实现层；真机复验仍 BLOCKED）

- 新增 `core/cutout/apiConfig.ts`（SecureStore 凭证+告知 consent，清除凭证联动撤销同意）、`engineResolver.ts`（凭证+同意齐全→TencentCiEngine，否则 UnavailableCutoutEngine 明确中文原因；stub 退出生产路径）。
- `processor.ts`：drain 顶部引擎守卫（不可用保持 pending 不领取不计次）+ 临时网络错误回 pending 并中断本轮（防断网烧尽重试次数）；`queue.ts` 新增 requeuePending/requeueFailed（顺带修复旧「重试失败项」按钮对 failed 无效的死路）。
- `batch-import.tsx` 三态：配置表单（4 字段+缺项提示）→ 上传告知（腾讯云/处理后即删/key 仅存本机，可拒绝走 addOriginalOnly 原图入库）→ 队列流；状态文案区分待配置/待同意/断网待重试/失败可重试。
- 质量门：21 suites/164 passed/0 skipped（+31）；typecheck 0；lint 0 error/14 warning。
- RED→GREEN：删引擎守卫 / 断临时错误分支 / consent 恒 true 三处变异均被测试抓红，恢复全绿。
- 未验证项（诚实记录）：UI 仅 RNTL 组件测试；expo-secure-store 为新原生依赖，**设备验证前必须重新 prebuild+构建**；断网错误名（fetch TypeError 约定）与 GoodsMatting 实际上传未在设备验证。

## 2026-08-01 知识收尾与用户确认清场

- 文档、规则、证据索引已按当前 GoodsMatting 实现、164 项测试基线、`D:/Projects/Clothes` Git 根和 ADB `unauthorized` 状态对齐。
- 用户在完整收尾汇报后明确回复“清场”；随后把无效 Metro 失败录屏和 `.private/results/` 下 `clean`、`corrupt`、`refactor-*`、`run` 六组可再生中间结果移入 Windows 回收站。
- 保留 `public-10`、有效离线录屏、正式截图、构建日志及全部未提交实现；未执行 Git 暂存、提交、重置或范围外清理。

## 2026-08-01 MVP-006 真机验收通过（ACCEPTED）

- ADB 授权恢复（`10c1b57d` OnePlus LE2120 / Android 14，状态 device）；旧数据保留：镜像 v3、12 件衣物、12 张原图。
- 修复 bundle 阻塞：`src/app/batch-import.test.tsx` 被 expo-router 的 require.context 当路由打进生产 bundle
  （@testing-library import Node console → Metro 打包失败）。移至 `apps/mobile/tests/batch-import.test.tsx`
  （仅改 import 相对路径），jest 11/11 通过、typecheck 0。**约定：路由目录 `src/app/` 下禁止放测试文件。**
- 构建：首次后台 gradle 因 shell 无 ANDROID_HOME 失败；写 `android/local.properties`（gitignored）后
  `BUILD SUCCESSFUL in 9m 20s`（505 tasks）。APK 331,287,562B，SHA-256 FD731D14…，dex 确认含 securestore。
- 覆盖安装数据保留，镜像 v3→v4 自动升级。真机验证（Metro dev-client）：
  - TDY-03：只换上装 `f9…→d8…`，其余槽位 ID 完全不变（截图前后对照）。
  - TDY-04：换一套带跳过原因「今天想换风格」，新组合不重复、主角上装保留。
  - TDY-05：四模式面板，应用「新鲜」后理由变为「新鲜模式，优先不同组合」。
  - TDY-08：点击「使用当前位置」才弹系统前台授权 → 拒绝 → 「定位未授权，可手选城市或无天气继续」
    → 手选上海，28.4–39.1℃ 实时参与推荐（外套槽消失，理由「天气较热，无需外套」）。
  - 飞行模式：「上海 28.4–39.1℃ · 使用缓存」，搭配不消失（截图+78.9s scrcpy 录屏）。
- 设备镜像 v4 复核：12 件衣物 + replace/skip/mode 三条反馈事件 + 上海天气缓存。
- logcat 无 FATAL EXCEPTION / AndroidRuntime / ReactNativeJS 错误。
- 环境限制（如实）：设备 screenrecord 段错误（exit 139），改用 scrcpy 便携包（`scripts/evidence/.tools/`）录制；
  本机 ffmpeg 不支持该视频 ycgco 抽帧，ffprobe 校验流有效，录制窗口终态由同步截图交叉印证。
- 证据：`scripts/evidence/MVP-006/INDEX.md`（解锁清单 8 项全 ✓）。

## 2026-08-02 MVP-009 日历计划：服务层 + 三屏 UI 完成，质量门全绿（真机验收待做）

- schema v7 新增 `plans` 表（当地日期字面量、单品快照 outfit_json、status planned/completed/changed、墓碑 deleted_at、无外键防误删造型）；镜像升级 v7（plans 随 GarmentDump）。
- `core/plan/calendar.ts` 纯函数（周一开头月历 42 格、UTC 日期数学、Intl 当地日期）+ `core/plan/planService.ts`（快照展开、记录已穿幂等、墓碑删除、lookId 显式 null 改回临时组合）+ `features/plan/planView.ts`（缩略图回退链、月统计/连续记录）。
- UI 三屏：PlanScreen（PLN-01 月历+缩略图+统计）、PlanDayScreen（PLN-02 同日多时段、记录已穿/有变化、修复入口）、PlanEditScreen（PLN-03 日期步进/时间段/场合/造型单选/临时组合 GarmentPicker/保存失败保留表单）；路由 `plan/[date]`、`plan-edit` 注册。
- 质量门：tsc 0；jest 56 suites / 400 passed / 0 failed；lint 0 error / 9 warning（基线持平）。
- 反向验证：删两处 `listActivePlans` 墓碑过滤 → 墓碑测试红（`red-break-tombstone.txt` exit=1），还原全绿；RED 证据 `red-calendar-service.txt`、GREEN `green-calendar-service.txt`。
- 待做：真机 PLN-01/02/03 截图、重启/时区切换无偏移验证、证据 INDEX 与 EXECUTION_STATE 收尾。

## 2026-08-02 MVP-009 真机验收通过（ACCEPTED）

- 真机（10c1b57d，Metro dev-client）：PLN-01 空态月历（周一开头、spillover 淡显、今天 oxblood 圆点）→ PLN-03 建「白天·通勤·关联造型 R3Slots」与「晚餐·晚餐·临时组合 2 件」两项同日计划 → 月历格双缩略图、PLN-02 两卡独立 → 只记录晚餐一项已穿（白天保持 planned）。
- force-stop 冷启动：日期/状态/缩略图零偏移、无重复记录。
- 时区反向验证：`service call alarm 3 s16` 切 America/New_York（设备 8/1 23:38 EDT）→「今天」移到 8/1 周六，8/2 计划字面量与已穿状态原位不动；恢复 Asia/Shanghai 再冷启动仍零漂移。
- 设备镜像 v7 复核：plans 段含两条计划与 outfitJson 单品快照（`pln-mirror-plans.json`）；logcat 无 FATAL/ReactNativeJS 错误。
- 复验驱动修复：PlanScreen 计划卡场合显示英文 key → 补 OCCASION_LABEL 中文映射（热更后截图确认）。
- 诚实限制（记入 INDEX）：保存失败保留表单与造型删除后修复入口两支在真机未注入故障演练，由 host 测试与代码路径覆盖；「有变化」内联输入真机未逐字输入。
- 证据：`scripts/evidence/MVP-009/INDEX.md`（截图 9 张 + RED/GREEN/RED-BREAK + 镜像 plans 段）。
- 下一卡：MVP-010-trip-packing。
