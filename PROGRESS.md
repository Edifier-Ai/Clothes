# PROGRESS

状态：MVP-004 ACCEPTED；MVP-005 待激活
当前任务：MVP-005
最后更新：2026-07-28

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

## 下一步（MVP-005 今日决策）

- 读 `tasks/backlog/MVP-005-today-decision.md`。
- 硬约束过滤 + 合法槽位组合 + 规则评分 + 版本化 `reason_codes`；
  12 件合法衣橱产生可复现推荐；记录已穿原子写造型/明细/场景/反馈；
  不可用衣物（待洗/干洗/借出/归档）不进候选。
