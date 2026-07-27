# PROGRESS

状态：MVP-000 ACCEPTED；MVP-001 IN_PROGRESS  
当前任务：MVP-001  
最后更新：2026-07-27

## 开工回执（MVP-000）

- 理解的目标：Android 优先交付 MVP-000~014：离线智能衣橱（12 件导入→端侧抠图修边→可解释推荐/换一件→记录→持久化→导出恢复），无账号无云。
- 实施顺序：严格按 ROADMAP 000→014。
- 当前基线：Node v24.18.0 / pnpm 11.17.0 / 构建 JDK Temurin 17（系统默认 21 亦可）/ SDK platforms 34-36 / adb 1.0.41 / 真机 OnePlus LE2120 / 模拟器 WHPX。
- 最大风险：端侧 ONNX 抠图在中端机的性能与边缘质量（MVP-002）；OPlus 设备 USB 安装与系统设置受限（已用 tap 自动化绕过安装，font 矩阵转模拟器）。

## 已完成

- MVP-000 ACCEPTED：pnpm monorepo（hoisted）+ Expo SDK57 + 四标签 + 方向3 tokens；typecheck/lint/test(17-0-0) 绿；红→绿反向验证；Gradle Debug BUILD SUCCESSFUL；真机安装启动+四标签切换+重启；390×844/360×800/430×932/1.3×字体 骨架截图；父仓库零触碰。证据：`scripts/evidence/MVP-000/INDEX.md`。

## 最近一次验证（MVP-000 终检）

- env-check OK；typecheck 0；lint 0；test 17/17/0；parent staged 27618=27618。

## 下一步（MVP-001）

- 读 `tasks/backlog/MVP-001-local-garment.md`。
- 先写验收：选一张真实衣物图→导入→SQLite(expo-sqlite+Drizzle)+私有文件(originals/masks/previews/thumbnails)→列表与详情可见→杀进程重启仍在。
- 红→绿：删库/删文件路径后断言失败，恢复后通过。
