# PROGRESS

状态：MVP-002 BLOCKED（无真图，管线/探针就绪）；MVP-003 IN_PROGRESS  
当前任务：MVP-003  
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
