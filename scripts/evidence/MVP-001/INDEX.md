# MVP-001 验收证据清单

日期：2026-07-28  
设备：OnePlus LE2120 / Android 14 / API 34；Expo SDK 57 / RN 0.86 / Hermes / Fabric。  
持久化方案：expo-sqlite（会话查询引擎）+ expo-file-system JSON 镜像 `garments_mirror.json`
（持久事实源，每次写后落盘、启动回灌）。原因见 `BLOCKED.md` B-4。

## 质量门

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 7 suites / **37 passed** / 0 skipped（含 dump/replaceAll 回灌、事务回滚、判重、软删/恢复、重启重开） |
| `pnpm lint` | 0 errors（5 良性 warnings） |

## 真机闭环（断网、无账号）

| 步骤 | 证据 | 结果 |
|---|---|---|
| 衣橱空态 CLS-01 | `cls01-empty.png` | 空态卡 + 标题栏「+ 添加」 |
| 导入来源 IMP-01 | `imp01-import-source.png` | 选图区 + 名称/类别/颜色/季节/场景表单 |
| 元数据确认 IMP-05 | `imp05-metadata.png` | 填好名称、选类别，保存按钮在固定底栏 |
| 保存→网格 CLS-01 | `cls01-grid.png` | FinalShirt 入网格，`originals/` 1 文件，镜像 1 条 |
| 单品详情 CLS-03 | `cls03-detail.png` | 抠图位 + 名称/类别 + 编辑/删除 |
| 编辑 CLS-04 | `cls04-edit.png` | 名称改为 FinalEdited |
| **重启持久** | `cls01-after-restart.png` | force-stop+重启后网格仍 FinalEdited（编辑跨重启存活） |

## 反向验证（红→绿，`_debug_fail_commit` 哨兵经 `run-as` 切换）

- **RED**：哨兵存在时保存 → UI 显示「保存失败：请重试。已填写的内容已保留」，表单保留，模态不关；
  `originals/` 无新增孤儿文件，`_staging/` 已清理，DB 无半条记录。
- **GREEN**：移除哨兵重试 → 保存成功，镜像 garments 计数 +1。

## 持久化机制实测（B-4 关键证据）

- expo-sqlite 提交在本机不 fsync：库文件 mtime 写后不变，force-stop 丢最近写入（同步/异步 API、
  DELETE/WAL、synchronous=FULL、closeAsync、绝对路径均试过，原始 logcat 探针值跨强杀重置）。
- expo-file-system 写文件跨 force-stop 持久（`run-as` echo+sync 探针验证）。
- 镜像方案：保存后 `garments_mirror.json` 落盘（实测 648B 含记录）；force-stop+重启经
  `restoreFromMirrorIfNeeded` 回灌 SQLite，网格恢复。编辑同理持久。

## 已知边界（非阻塞）

- 同一次失败重试若复用陈旧 staged 对象，第二次 commit 的文件可能缺失（详情页对缺失原图显示
  「原图缺失/可修复」态，记录保留）。正常单次添加/编辑无此问题；后续卡可在新选图时重置 staged。
