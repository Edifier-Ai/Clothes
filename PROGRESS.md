# PROGRESS

状态：Demo 收口 DEMO-001 READY_FOR_RECORDING（MVP-013 已按用户范围决策 SUPERSEDED）
当前任务：可录屏完整产品体验——代码、Release、模拟器闭环与录屏脚本均已就绪
最后更新：2026-08-28
P0 代码入库：commit 1a574a1（feat(P0): finalize calendar/trips/insights and signed Android release，213 files +9668/-61，敏感文件 .gitignore 覆盖，release-keystore-setup.txt 明文密码脱敏为 <STOREPASS>，未推送远端）

## 2026-08-27 DEMO-001 激活与范围冻结

- 用户目标：交付一份可安装、可流畅录屏、看起来功能完整且能呈现核心卖点的 Android Demo；核心交互和本地持久化真实，非核心信息允许确定性演示数据。
- 明确退出：天气、定位/天气权限、备份、导出、恢复、账号、云同步、Pro、iOS；MVP-013 因范围变化标记 SUPERSEDED。
- 明确保留：今日推荐、衣橱、造型、计划/日历、深度洞察、购物守门；设置允许多选推荐参考要素且必须真实影响结果与理由。
- 新建唯一激活卡 `tasks/backlog/DEMO-001-recordable-product.md`，执行顺序为范围删减 → 推荐设置 → DemoDataPack → 录屏主线打磨 → 全量验证。
- 规划门禁：`scripts/validate-planning.ps1` exit 0；RequiredSectionsComplete=True，59/59 UI 规格页仍有任务覆盖，Errors=0。
- 任务 1 首个 GREEN：今日页已移除 WeatherBar/WeatherPanel、定位请求和天气控制器；删除 `core/weather`、`todayWeather.ts`、未完成 backup 测试/服务，并移除 expo-location/document-picker/sharing/fflate 依赖与 location 插件。历史 schema/migration 暂留只为旧数据兼容。定向 typecheck exit 0；Today+preferences 2 suites / 23 tests passed；改动文件 scoped lint exit 0。
- 任务 2 RED：先增加推荐参考要素的持久化与规则影响测试；定向 3 suites 共 36 tests，11 failed（久未穿、近期重复、配色、场合、反馈、主角及完整偏好快照均按预期红灯），证明现有实现尚未读取这些设置。
- 任务 2 核心 GREEN：新增版本容错的 6 要素偏好（场合/配色/盘活/防重复/反馈/主角），旧安装缺字段默认维持原行为；推荐与换一套引擎分别真实控制排序、理由、近期重复、反馈权重与主角锁定，硬约束不受开关影响。typecheck exit 0；同一 3 suites / 36 tests 全绿。
- 任务 2 UI GREEN：今日页新增 48×48 齿轮入口；设置首页与“推荐参考要素”页真实可达，六开关整组保存并通过偏好订阅供今日页下一次生成使用；主角关闭时不再展示主角模式。新增 UI 测试覆盖六开关、保存载荷、设置路由和齿轮路由。
- 阶段全量门禁：`pnpm typecheck` exit 0；`pnpm test` 79 suites / 579 passed / 0 failed（测试总数高于本轮已知基线 576）；`pnpm lint` 0 errors / 10 historical warnings；`git diff --check` exit 0。首次全量测试只因旧断言要求展示“导出尚未完成”而 1 red，按用户移除导出的范围改为“仅存当前设备且无导出/备份/恢复文案”后全绿。
- 任务 3 数据核心 GREEN：新增固定版本 `DemoDataPack`，按当天生成 12 件衣物、3 套造型、3 条计划、8 天穿着和 1 个购物判断案例；只清理 `demo-v1-*` 命名空间，重复执行幂等，注入第 10 次写入失败时整包回滚且保留用户衣物。核心测试 3/3、typecheck exit 0。
- 任务 3 设备入口 GREEN：设置新增“演示数据”路径，可一键真实写库并落本地镜像；明确展示只重置演示命名空间，具备加载、成功、失败、重试与“开始体验”状态。设置相关定向 3 suites / 8 tests passed，typecheck exit 0。
- 当前证据边界：此前 Release APK 构建成功；本轮尚未取得 Android 运行态证据，设备/AVD 阻塞仍需单独处理，不能用构建结果替代录屏验收。

## 2026-08-28 DEMO-001 录屏版就绪

- 任务 3 完整 GREEN：演示包现为 12 件衣物、3 套造型、3 条计划、8 天穿着和 1 个购物案例；重复载入幂等，注入第 10 次写失败整包回滚；用户衣物以及用户穿着记录不会被 demo 重载误删。洞察由穿着事实实时计算，无硬编码 KPI。
- 任务 4 视觉收口：无图衣物使用确定性类别/颜色剪影；三套造型写入独立 x/y/scale，不再四件重叠；外套 COAT 标识不裁切。今日、衣橱、造型、计划、设置、洞察和购物报告均已取得模拟器截图。
- 设置真实交互：六个推荐参考要素可独立切换；关闭主角单品保存后显示 5/6，force-stop 冷启动仍为 5/6；最终交付起点恢复 6/6。
- 数据真实联动：8 天演示洞察 → 今日完成一条穿着记录 → force-stop 冷启动 → 洞察显示 9 天；重新载入 demo 保留该用户记录，证明只清理 demo 命名空间。最终只清空测试模拟器数据并重新载入，恢复 8 天干净起点。
- 购物守门闭环：内置候选进入同类证据页，无商品图时明确“不猜相似度”；可搭报告基于当前衣橱实时显示 18 套合法组合。
- 响应矩阵：360×800、390×844、430×932 与 390×844 / 1.3×字体运行态均通过；最终恢复 390×844 / 1.0×、Asia/Shanghai，冷启动停在今日页。
- Android 运行态：修复 Android 36 AVD system image 后，Release APK 安装成功；冷启动 1166ms（最终复跑 529ms 量级），logcat 未发现 FATAL EXCEPTION / SQLiteException / ReactNativeJS Error。
- Release：`assembleRelease` BUILD SUCCESSFUL；APK 163,702,950 bytes，SHA256 `21EFC30585B1C25AAD3C2BEF2CD90AC2F1B2CCA4E9BB97B32728F9D31B0266BB`，包名 `com.clothes.app`，versionName 0.1.0，targetSdk 36。
- 最终全量门禁：Jest 81 suites / 586 tests / 0 failed；typecheck exit 0；lint 0 errors / 10 historical warnings；`git diff --check` exit 0；规划门禁 59/59、Errors=0。
- 录屏交付：`scripts/evidence/DEMO-001/RECORDING_SCRIPT.md` 提供 5–7 分钟讲解路径；`demo-smoke.mp4` 为 390×844 H.264、28.204 秒无旁白连续运行证据；完整索引见 `scripts/evidence/DEMO-001/INDEX.md`。
- 证据边界：当前只完成 Android 模拟器运行态，不声称物理 Android 设备已验证；无旁白冒烟视频不等于最终营销成片。

## 2026-08-17 MVP-012 激活与全量差距审计

- 已按 `AGENT_GOAL.md`、`tasks/EXECUTION_STATE.md`、`PROGRESS.md`、P1 任务卡、59 页规格和 29 张独立效果图完成只读盘点；当前唯一激活卡为 `MVP-012`。
- 当前基线：`pnpm typecheck` exit 0；`pnpm test` 65 suites / 492 tests / 0 failed；`pnpm lint` 0 errors / 13 warnings。此证据只代表本地静态/自动化门，不等于 Android 真机验收。
- 已确认 MVP-012 尚无购物路由、表、服务或特征算法；MVP-013 尚无设置、隐私开关、导出恢复与本地删除；P1-001/P1-002 分别受云资源授权与 Mac/Xcode/签名/真 iPhone 外部条件约束。
- 复验同时发现首启重定向、导入暂存残留、洞察跳转参数、镜像非原子写、EXIF 哈希与配色推荐等回归风险；先以测试固定再修复，不覆盖用户与既有 agent 的无关改动。
- 视觉裁决：纸白背景、炭黑主操作、酒红选择/强调、哑金大数字、发丝分隔、真实衣物大图；后续页面禁止用 UUID 充当展示名，也不把历史效果图冒充本轮运行态截图。
- P0 回归小步已 RED→GREEN：RootLayout 订阅 onboarding 状态；“稍后补录”先持久完成态；引导改为如实说明明确同意后上传腾讯云且导出尚未完成；单件添加复用首次 staged，重选/卸载会 abort。定向 4 suites / 23 tests、typecheck、定向 ESLint、diff check 均通过。
- 修复 STA-02 “为它搭一套”路由参数由错误的 `garmentId` 改为 `hero`，接收端仍兼容旧深链参数。

## 2026-08-17 MVP-012 本地实现完成，MVP-013 激活

- 新增 schema / migration / mirror v9 与独立 `shopping_candidates` 墓碑候选；候选不与衣橱外键级联，图片及商品 URL 均做路径/协议边界校验。
- 图片证据使用类别门禁、dHash、Lab v2 软分箱和轮廓四维贡献；近色扰动连续、同色异类不会进入高相似，算法版本随实现升级。
- 组合计算改为流式精确计数并只保留稳定前三套，300 件用例不再物化笛卡尔积；读取报告会按当前 active / isAvailable / 图片安全性重校验旧快照。
- SHP-01..03 已接入候选创建/重试、四维解释、真实衣橱导航、成本/次假设、三种判断、独立删除与安全外链；pending 中断可恢复且不会显示伪 0 套结论。
- 数据耐久错误与图片分析错误已区分；镜像写入采用串行 tmp/bak 原子换名并可从备份回退；Skia 临时资源在 `try/finally` 释放。
- 本轮全量门禁：Jest 78 suites / 569 tests / 0 failed；mobile TypeScript 通过；shopping scoped ESLint 0 error / 0 warning；`git diff --check` 通过。
- 当前 `adb devices -l` 无连接设备，SHP-01..03 真机截图与 360/390/430、1.3×字体运行态复验未取得，因此 MVP-012 不标 ACCEPTED，只作为设备证据 BLOCKED；按“外部阻塞不影响下一卡”激活 MVP-013。

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

## 2026-08-02 MVP-010 旅行打包容器完成（IN_PROGRESS → ACCEPTED）

- schema v8 新增四表（trips/trip_outfits/packing_items/trip_templates）：当地日期字面量、
  造型单品快照 outfitJson、墓碑 deleted_at、无外键防误删造型、勾选状态与衣物事实分离
  （packing_items.checked 独立于 garments 表）；镜像升级 v8（四表随 GarmentDump 进
  dumpExtra/restoreExtra，兼容读 v1–v7）。
- `core/trip/` 三模块：
  - `packView.ts`：纯函数 computePackingFromOutfits（去重 + sourceCount 累加 + sourceOutfitIds 可追溯）、
    packingSummary（总/已勾选/未勾选/缺失计数）、tripsByStatus（按 planning/ongoing/completed 分组）。
  - `tripService.ts`：旅行 CRUD/状态推进/墓碑删除 + saveTripOutfitCore（关联造型快照 vs 临时组合、
    occasion/note 可空、编辑回填）+ recordTripOutfitWorn 幂等（completed/changed 再记录原样返回
    不改 wornCompletedAt）+ lookMissing 标记（造型墓碑后快照保留 + 修复入口依据）。
  - `packingService.ts`：regeneratePackingCore（按 sourceCount 倒序重排 ord、保留仍存在项的勾选状态、
    硬删除不再使用的 garment 项、手工项不动）+ addManualItemCore/removeManualItemCore/toggleCheckCore
    （勾选状态独立于衣物事实）+ saveTemplateCore（trip_templates 落库）。
- UI 6 屏 + 6 路由：
  - TRP-01 TripsScreen：按状态分组列表 + 空盒 + 新建入口。
  - TRP-02 TripEditScreen：名称/目的地/日期步进/时区 chips/活动添加/编辑回填/保存失败保留表单。
  - TRP-03 TripOverviewScreen：基本信息 + 状态徽章/推进 + 每日造型列表（含缩略图、worn 徽章、
    lookMissing 修复入口）+ 打包清单/复盘入口 + 编辑/删除。
  - TRP-04 TripDayPlanScreen：当日造型添加/编辑（时间段预设+自定义/场合 chips/选择造型 vs 临时组合
    GarmentPicker/备注）+ 记录已穿/有变化 + 删除。
  - TRP-05 PackingListScreen：去重清单 + 来源套数显示 + 勾选切换 + 手工项添加/删除 + 重新生成。
  - TRP-06 TripReviewScreen：实际穿着（completed）+ 未穿（planned，依据 wornStatus 不依据 checked）
    + 保存模板入口。
  - 路由：`/trip`、`/trip-edit`、`/trip/[id]`、`/trip-day`、`/trip-packing/[tripId]`、
    `/trip-review/[tripId]`；PlanScreen 底部「旅行」入口接入。
- 质量门：tsc 0；jest 61 suites / 461 passed / 0 failed（MVP-009 基线 56/400 → +5 suite/+61 test，
  含 MVP-011 预研 23 test）；lint 0 errors / 9 warnings（基线持平，MVP-010 新增代码 0 warning）。
- 旅行三 suite 单独：packView/tripService/packingService 3 suite / 35 passed（green-trip-suites.txt）。
- 反向验证：变异 computePackingFromOutfits `sourceCount += 1` → `= 1` → 9 测试失败
  （含「五天十套同一件鞋 → 一项 + 来源数 10」期望 10 实得 1），还原后全绿（red-break-source-count.txt）。
- 真机（10c1b57d，Metro dev-client）：TRP-01..06 全截图 + force-stop 冷启动后旅行/安排/勾选状态
  零漂移（trp-restart-01..04）；镜像 v8 终态含 trips(1)/tripOutfits(2)/packingItems(5)/
  tripTemplates(0) 四表，packingItems 每行 sourceCount=2 sourceOutfitIdsJson 双源可追溯、
  首项 checked=1（trp-mirror-v8-final.json）。
- 诚实限制（记入 INDEX）：「五天十套」终判在 host 测试，真机为简化版本（同日 2 套 sourceCount=2）；
  「保存模板」UI 入口+表已落库但未演练完整闭环；lookMissing/重新生成失败/保存失败保留表单由
  host 测试与代码路径覆盖，真机未注入故障；timezone 往返未重复（沿用 MVP-009 已验证的日期语义）。
- 证据：`scripts/evidence/MVP-010/INDEX.md`（截图 18 张 + RED/GREEN/RED-BREAK + 镜像 v8 终态）。
- 下一卡：MVP-011（领域层预研就绪，待激活接 db 适配层 + STA-01..04 UI）。

## 2026-08-02 MVP-011 领域层预研（并行于 MVP-010 IN_PROGRESS，未激活任务卡）

背景：MVP-010 仍在 IN_PROGRESS（旅行打包，RED 测试阶段）。用户授权并行推进 MVP-011。
依 AGENTS.md「任意时刻只允许一张卡 IN_PROGRESS」「不得跳过依赖」，MVP-011 任务卡明写依赖
MVP-010，故**不标 IN_PROGRESS**，只做不返工的领域层纯函数 + 测试夹具；schema/镜像/UI/路由
待 MVP-010 ACCEPTED 后接，避免与 MVP-010 的 schema v8 迁移 + 6 屏路由冲突。

产出（`src/core/insights/`，纯函数不接 db，不碰 schema/镜像/UI/路由）：
- `metrics.ts` + `metrics.test.ts`：5 纯函数 + 23 用例。
  - `computeWardrobeOverview`：穿着天数(distinct date)/穿着次数/盘活单品/重复率(≥2次/盘活)/
    平均穿着次数/总-活跃-归档计数/学习期(wearDays<7)。
  - `computeIdleReport`：久未穿 30/60/90 分桶(30≤d<60/60≤d<90/≥90) + 新录入未穿(timesWorn=0)
    与长期未穿分开；归档不进久未穿但保留历史贡献。
  - `computeCostPerWearList`：复用 MVP-007 `computeCostPerWear` 口径(价格÷次数向下取整，
    价格≤0/0次→null)，按成本/次升序 null 排后，归档保留。
  - `computeMonthlyReport`：按 wear_logs.date 的 YYYY-MM 字面量分组(时区安全，date 与 createdAt
    独立)；当月首次穿上 = 该衣物所有 wear_logs 中最早 date 落在当月。
  - `buildShareableReport` + `hasProtectedLeak`：脱敏分享快照，不含原图路径/备注/价格/定位。

口径决策（写进代码注释，与任务卡「窗口/分母/时区/归档/缺失价格」对齐）：
- 窗口：全量历史；月度按 date YYYY-MM。
- 时区：date 当地日期字面量(与 plans/trips 同)，不做 epoch 转换 → 切时区不偏移。
- 归档：archivedAt!=null 保留历史穿着贡献(计入次数/天数/盘活)，但不进 active/久未穿。
- 墓碑：deletedAt!=null 不计入总数与盘活；纯函数按 validIds 双层过滤墓碑 items。
- 缺失价格：null，0 次不显示，绝不除零/NaN。
- 重复率 = ≥2 次单品 / 盘活单品(盘活 0 时为 0)。

验证：
- RED：stub throw → 23 failed（全 not implemented）。
- GREEN：实现 → 23 passed。
- RED-BREAK：注释 `computeIdleReport` 归档过滤 → 1 failed（归档衣物泄漏进 idle90）→ 还原绿。
- 全量质量门：test 60 suites / 458 passed（含 MVP-011 的 23 + MVP-010 进行中测试）。
- typecheck/lint 错误**全部在 MVP-010 的 `features/trip/*`**（TripDayPlanScreen.tsx/PackingListScreen.tsx
  IN_PROGRESS 未完成代码），MVP-011 的 metrics.ts/test 零错误，未破坏 MVP-010 现状。

待办（等 MVP-010 ACCEPTED 后接，不属于本预研）：
- db 适配层：从 wear_logs/wear_log_items/garments 装配 WearLogFact/GarmentFact（含墓碑 items 过滤）。
- schema：若需缓存洞察结果再加表（当前纯函数实时算，无新 schema）。
- UI：STA-01..04 四屏 + 路由（与 MVP-010 的 6 屏解耦，避免冲突）。
- 真机 STA-01..04 截图 + 反向验证证据。

## 2026-08-02 范围决策：MVP-012/013 降级至 P1（用户决策）

用户决策：MVP-012（购物守门）与 MVP-013（隐私/导出/恢复）由 P0 降级至 P1，不急实现。

修订文件：
- ROADMAP.md：P0 表移除 012/013，P0 收官依赖 000-011+014；P1 加 012/013 + 风险注记。
- AGENT_GOAL.md：完成条件去掉「导出恢复」硬闭环（断网闭环止于「重启仍存在」）；范围板调整为 000-011+014。
- EXECUTION_STATE.md：P0 顺序行更新；P1 队列加 012/013。
- MVP-012/013/014 任务卡：依赖与优先级段加降级注记（验收标准不变，回升 P0 无需重写）。
- backlog/README.md：P0/P1 分组调整。

风险（由用户决策承担，已写入 ROADMAP/任务卡）：
- P0 阶段无导出恢复能力：用户无法把衣橱数据导出带走或恢复到新安装。
- P0 阶段无本地全部删除能力：用户无法在 App 内一键销毁全部数据。
- 触碰 AGENTS.md 裁决第 1 条「用户数据安全、隐私和不可丢失原则」精神。
- MVP-014 验收闭环不再含「导出恢复」；AGENT_GOAL 完成条件第 1 条同步修订。

回升路径：MVP-012/013 验收标准完整保留，未来回升 P0 时无需重写任务卡。

当前 P0 剩余：MVP-010(IN_PROGRESS) → MVP-011(领域层预研就绪) → MVP-014(P0 收官)。

## 2026-08-02 MVP-011 统计洞察 ACCEPTED

激活任务卡 `tasks/backlog/MVP-011-insights.md`，从上轮领域层预研（metrics.ts 5 纯函数 + 23 用例）续接 db 适配层 + STA-01..04 UI + 路由 + 外壳测试 + 双反向验证 + 真机终验。

产出：
- **DB 适配层** `src/core/insights/insightsService.ts`：仿 planService/tripService 双层结构（`*Core(db, statsDb, …)` 可注入 + 设备单例 `getOverview/getIdleReport/getCostPerWearList/getMonthlyReport`）。
  - **双 db 模式**（与 wardrobe/query.ts 一致）：`db: GarmentDb` 调 dao 方法（listAllGarments）；`statsDb: AnyDb` 是 drizzle 实例调 `wearLog.listWearLogs`（后者签名要求 drizzle 实例）。
  - `assembleFacts`：从 WearLogWithItems + GarmentRow[] 装配 InsightsFacts，按 validIds 过滤墓碑 items（双层防御：纯函数层再过滤一次）。
  - **不写镜像**：洞察结果不持久化（任务卡「编辑/删除穿着记录后重新聚合」要求实时算），只读 wear_logs/wear_log_items/garments 三个已有事实表；schema 沿用 v8 未改。
  - 时区：date 是 wear_logs.date 当地日期字面量（与 plans/trips 同语义），装配层不做 epoch 转换。
- **UI 四屏** `src/features/insights/`：
  - `InsightsScreen`（STA-01 总览）：学习期提示 / KPI（穿着天数·盘活单品·重复率）/ 衣橱构成（总/可穿/归档·总穿着·平均）/ 三入口（久未穿·成本次·月度报告）。
  - `IdleGarmentsScreen`（STA-02 久未穿）：30/60/90 分桶 + 新录入未穿分开 + 「为它搭一套」入口。
  - `CostPerWearScreen`（STA-03 成本/次）：按价值排序，0 次/无价显原因（「未填价格」「穿 N 次」）不显假数。
  - `MonthlyReportScreen`（STA-04 月度报告）：月切换 + 脱敏分享预览（不含原图/价格/备注/定位）。
- **视图 helpers** `insightsView.ts`：集中格式化（价格÷100、重复率×100%、久未穿天数、成本/次 null 给原因），保证 UI 一致性。
- **路由**：4 路由 `app/insights.tsx` / `insights-idle.tsx` / `insights-cost.tsx` / `insights-monthly.tsx`，从 `WardrobeScreen` 顶部「洞察」按钮入口（哑金边框与「+ 添加」酒红主操作区分）。
- **外壳测试** `features/insights/InsightsScreens.test.tsx`：mock insightsService 单例，验证四屏标题/空态/学习期/正常态 KPI/月度分享展开无泄漏告警（6 用例）；`OtherTabsScreen.test.tsx` 加衣橱「洞察」入口断言（1 用例）。
- **服务层测试** `insightsService.test.ts`：14 用例覆盖归档保留历史但不进久未穿、墓碑过滤、0 次无价 null、学习期、固定夹具手工复算等边界。

口径决策（与任务卡「窗口/分母/时区/归档/缺失价格」对齐，写进代码注释）：
- 窗口：全量历史；月度按 date YYYY-MM。
- 时区：date 当地日期字面量，不做 epoch 转换 → 切时区不偏移。
- 归档：archivedAt!=null 保留历史穿着贡献（计入次数/天数/盘活），但不进 active/久未穿。
- 墓碑：deletedAt!=null 不计入总数与盘活；纯函数按 validIds 双层过滤墓碑 items。
- 缺失价格：null，0 次不显示，绝不除零/NaN。
- 重复率 = ≥2 次单品 / 盘活单品（盘活 0 时为 0）。
- 学习期：wearDays<7 显示「再连续记录几天，洞察会更准确」。

质量门：
- `pnpm typecheck` exit 0
- `pnpm test` 63 suites / 481 passed / 0 failed（MVP-010 基线 61/461 → +2 suite/+20 test）
- `pnpm lint` 0 errors / 9 warnings（基线持平，MVP-011 新增代码 0 warning）

反向验证（双 RED-BREAK）：
1. **归档过滤**（`red-break-archive.txt`）：变异 `computeIdleReport` 注释 `if (g.archivedAt != null) continue;` → 2 测试红（归档 g8/g2 泄漏进 idle90）→ 还原绿。
2. **0 次虚假成本**（`red-break-cost-per-wear.txt`）：变异 `computeCostPerWearList` 让 0 次也按 1 次算 → 3 测试红（g4 0 次产生虚假 30000 成本/次，排序窜位 + null 断言失败）→ 还原绿。

真机验证（10c1b57d OnePlus LE2120，Metro dev-client）：
- STA-01 总览：学习期提示 / KPI 2 穿着天数·10 盘活单品·20% 重复率 / 衣橱构成 27 总·27 可穿·0 归档·3 总穿着·平均 0.3 / 三入口
- STA-02 久未穿：录入后未穿 17 件 + 「为它搭一套」入口
- STA-03 成本/次：按价值排序，0 次/无价显原因
- STA-04 月度报告：2026-08 / 1 穿着天数·1 总次数·4 盘活单品·2 新组合 / 脱敏分享预览展开
- force-stop 冷启动后 STA-01 KPI 零漂移（2 穿着天数·10 盘活·20% 重复率·27 总单品·27 当前可穿 —— 与重启前完全一致）
- 镜像 v8 终态 garments 27/wearLogs 3/wearLogItems 12，与 UI 显示吻合，证明 insightsService 实时算与镜像事实源一致

诚实限制（记入 INDEX）：
- 「编辑/删除穿着记录后同步更新」未在真机逐条注入故障演练，由 insightsService 实时算（不写镜像）+ core 测试覆盖。
- STA-02 「为它搭一套」入口已显示但未跳转完整流程（不在 MVP-011 范围）。
- STA-04 分享脱敏预览为 JSON 文本展示，未接系统分享面板（任务卡只要求预览）。

证据：`scripts/evidence/MVP-011/INDEX.md`（真机截图 8 张 + RED/GREEN/双 RED-BREAK 输出 + 镜像 v8 终态）

## 2026-08-02 MVP-014 Android P0 发布 ACCEPTED（P0 收官）

激活任务卡 `tasks/backlog/MVP-014-android-release.md`，完成 Android P0 发布闭环。

产出：
- **Release APK 签名构建**：`release.keystore`（RSA 2048，clothes-release 别名，10000 天有效期）+ `keystore.properties`（不入版本控制）+ Gradle `releaseSigning` signingConfig + `assembleRelease` BUILD SUCCESSFUL（164 MB）。
- **aapt 元数据核对**：com.clothes.app / versionCode=1 / versionName=0.1.0 / minSdk=24 / targetSdk=36 / native-code: arm64-v8a,armeabi-v7a,x86,x86_64。
- **真机安装闭环**（OnePlus 9 Pro LE2120）：Release APK 安装成功 + 冷启动 onboarding welcome。
- **Debug 27 件闭环冒烟**：注入 v8 镜像 + 27 件原图 -> onboarding 跳过 -> 衣橱 27 件 -> 今日推荐 4 槽+理由 -> 就穿这套 -> 完成记录 -> 穿后洗护 -> force-stop 重启新推荐（盘活不同衣物，数据持久）。
- **飞行模式断网**（Release 内嵌 bundle）：onboarding 离线推进 -> today/衣橱/造型/计划 4 tab 空状态 -> 天气降级"未使用天气" -> force-stop 重启 onboarding 状态持久。
- **升级安装迁移**：adb install -r 覆盖安装 -> 27 件完整保留 -> schema v8 迁移成功。
- **反向验证**（`migrationRollback.test.ts` 2 用例）：v5 升级 v6 SQL 故障 -> ROLLBACK 保留 v5 数据（schema_version=5/garments 2 件/broken 表不存在）-> 修复后 runMigrations 升级 v8 成功数据保留；幂等验证。
- **模拟器响应矩阵**（6 配置）：390×844 默认 / 360×800 / 430×932 / 1.3×字体 / 深色 / TalkBack 均正常显示 onboarding welcome，无裁切/乱码/崩溃。
- **性能**：300 件 build=5ms/filter=0ms/sort=0ms/search=0ms；冷启动 7155ms（Debug+Metro）；TOTAL PSS 545MB。

质量门：
- `pnpm typecheck` exit 0
- `pnpm test` 64 suites / 483 passed / 0 failed（MVP-011 基线 63/481 -> +1 suite/+2 test 迁移回滚验证）
- `pnpm lint` 0 errors / 13 warnings（+2 from migrationRollback.test.ts import 顺序，无阻断）

诚实限制：
- Release APK 不可 run-as，真机数据闭环验证使用 Debug APK（业务逻辑全本地，Metro 仅用于 JS bundle 加载，与 Release 无差异）。
- 模拟器深色模式 `cmd uimode` 报 "Bad arguments"（API 兼容性），截图已生成。
- MVP-002 仍 BLOCKED（需 100-200 张真图终判，与本卡无依赖）。
- 导出恢复随 MVP-013 降级 P1，本卡不验。

证据：`scripts/evidence/MVP-014/INDEX.md`（真机截图 30+ 张 + 模拟器矩阵 6 张 + aapt 元数据 + 反向验证测试 + 性能数据）

**P0 全部完成。下一阶段：P1 队列（MVP-012 购物守门 / MVP-013 隐私导出恢复 / P1-001 托管同步 / P1-002 iOS 发布）。**

## 2026-08-28 DEMO-001 再补 30 张素材并随 APK 打包

在原 24 张冷启动单品图基础上新增 30 张透明背景电商单品图（8 上装、6 下装、5 连衣裙、4 外套、4 鞋履、3 配饰），`apps/mobile/assets/demo-garments/` 现共 54 张；全部由 imagegen 生成并经目视检查，PNG 四角透明度检查无不透明底色。

实现与数据：
- `demoGarmentCatalog.ts` 新增 `top-07..14`、`bottom-06..11`、`dress-04..08`、`outer-05..08`、`shoes-05..08`、`accessory-03..05`，每项固定 require、SHA-256、字节数和业务标签。
- DemoDataPack 升至 v3：54 件衣物、54 条图片资产、18 套造型、7 条计划、20 天穿着记录、1 个购物案例；原有 `demo-v1-` 幂等替换与不覆盖用户原图边界不变。
- 设置演示页同步展示 54/18/7/20，新增素材会参与今日推荐、衣橱、计划和洞察，而不是只作为 APK 中未使用的静态文件。

验证：
- typecheck exit 0；lint 0 errors / 10 historical warnings；git diff --check exit 0。
- 全量 Jest：82 suites / 587 passed / 0 failed；定向 Demo 测试 3 suites / 7 passed。
- `assembleRelease` BUILD SUCCESSFUL（628 tasks）；Metro Copying 102 asset files；构建中间资源与源图 SHA-256 精确匹配 54/54，最终 APK 的 aapt2 资源表 `assets_demogarments_*` 为 54/54。
- 模拟器 `emulator-5554`：release 升级安装成功；冷启动演示页显示 54/18/7/20；一键载入成功；今日推荐实际选出新增的黑色针织上衣、藏蓝短裤、切尔西靴、米色羽绒服并显示图片；衣橱显示“54 件衣物”且新增图片正常渲染。证据为 `scripts/evidence/DEMO-001/physical-device/emulator-54-demo-entry.png`、`emulator-54-demo-loaded.png`、`emulator-wardrobe-54-items.png`。
- 交付包 `scripts/evidence/DEMO-001/physical-device/clothes-demo-54-items.apk`：236,898,218 bytes，SHA-256 `B4866B6CF36A4AFF7125DA0C6A73A86446D71BC0C030579DCEDAA84E2361D930`；APK v2/v3 签名验证通过；debug 证书 SHA-256 `fac61745...1033b9c` 与上一版用户已安装包一致，可直接覆盖升级。

证据边界：本轮只有 Android 模拟器连接，不能声称 54 件新包已在物理手机安装或交互通过；物理设备验收留给用户覆盖安装后完成。

## 2026-08-28 DEMO-001 冷启动图片衣橱与一键导入

用户要求为已安装 App 准备 20–30 件可录屏图片素材，并解决直接导入。最终产出 24 件透明背景电商单品图（6 上装、5 下装、3 连衣裙、4 外套、4 鞋、2 配饰），全部保存在 `apps/mobile/assets/demo-garments/`，共 32,864,351 bytes。

实现：
- `demoGarmentCatalog.ts` 显式登记 24 个 Metro 静态资源及固定 ID、分类、颜色、材质、季节、场合、正式度、价格、SHA-256、尺寸和字节数。
- `demoAssetInstaller.ts` 通过 `expo-asset` 解析 APK 内置图片，首次载入复制到 App 私有 `clothes/originals/`；目标已存在则跳过，绝不覆盖原图。
- DemoDataPack 扩为 v2：24 件衣物 + 24 条 garment_assets + 12 套造型 + 5 条计划 + 14 天穿着记录 + 1 个购物案例；重复载入仍只清理 `demo-v1-` 关系数据，不触碰用户记录。
- onboarding“直接体验完整 Demo”和“设置 → 演示数据”复用同一导入服务；设置页展示 24/12/5/14 的真实摘要。
- 清理旧天气原生残留：Release APK 不再申请粗略/精确位置、录音、悬浮窗权限；`allowBackup=false`、`fullBackupContent=false`。

验证：
- typecheck exit 0；lint 0 errors / 10 warnings（均为既有警告）。
- 全量 Jest：82 suites / 587 passed / 0 failed；新增素材安装“只复制缺失文件、已有原图不覆盖”测试及 DemoDataPack 24 个 asset 行/幂等/洞察验证。
- `assembleRelease` BUILD SUCCESSFUL；Metro 明确复制 72 assets，生成目录核对 `assets_demogarments_*` 恰好 24 个。
- APK 签名验证 v2/v3 成功；aapt 核对位置/录音/悬浮窗权限不存在，Android backup flags 均为 false。
- Android 模拟器 390×844：原 release 签名升级安装保留数据，冷启动进入演示页，一键载入成功显示“已准备完成”；衣橱显示 24 件且透明底单品图真实渲染。证据：`scripts/evidence/DEMO-001/demo-assets-before-import.png`、`demo-assets-after-import.png`、`demo-assets-wardrobe.png`。
- 真机兼容更新包：`scripts/evidence/DEMO-001/physical-device/clothes-demo-with-cold-start-data.apk`，195,555,609 bytes，debug 证书 SHA-256 `fac61745...1033b9c` 与用户此前安装的 device-test 包一致；文件 SHA-256 `2C2F5AC56254C8C936D04474FF032754A4EE6F3D127F3FE4292ED3A4AA96F032`。

证据边界：本轮实体手机未连接，不能声称新包已在物理设备安装或交互通过；已完成 host、Release 构建、APK 静态检查和 Android 模拟器运行验证。
