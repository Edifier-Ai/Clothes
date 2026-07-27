# PROGRESS

状态：MVP-001 ACCEPTED；MVP-002 IN_PROGRESS  
当前任务：MVP-002  
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

## 下一步（MVP-002）

- 读 `tasks/backlog/MVP-002-segmentation-benchmark.md`。
- 端侧抠图基准：选模型（U²-Net-p 基线 / IS-Net 候选），100–200 真图或可复现夹具，
  测直接可用率/严重失败率/单张耗时/连续12张不闪退；未达标保留双档。真图缺则 BLOCKED 标注。
