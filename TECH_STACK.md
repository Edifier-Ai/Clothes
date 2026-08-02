# Clothes 技术选型与实现边界

版本：V1.0  
日期：2026-07-27  
状态：P0 实施规格

## 1. 结论

采用 `React Native + Expo Development Build + TypeScript`，配合少量 Kotlin/Swift 原生模块。核心数据、图片和推荐默认在设备本地完成；抠图使用现成分割 API（2026-07-31 用户拍板，免费额度优先，见第 4 节）。P0 不依赖账号、业务后端或其他付费 AI。

选择 React Native 而不是 Flutter 的决定因素，是本产品最难的链路需要高性能二维画布（Skia）和成熟的原生生态。选择 Expo 是为了路由、相册、相机、文件和构建效率，但正式开发必须使用 Development Build，不以 Expo Go 为运行边界。

## 2. 客户端栈

| 能力 | 选择 |
|---|---|
| App | React Native、Expo、TypeScript strict |
| 构建 | Expo Development Build、Prebuild/CNG，本地 Android 构建 |
| 导航 | Expo Router |
| 状态 | Zustand；服务端状态出现前不引入复杂请求框架 |
| 设计系统 | 自建 tokens 和组件，不使用整套通用 UI 主题 |
| 列表与图片 | FlashList、expo-image |
| 动画与手势 | Reanimated、Gesture Handler |
| 造型/蒙版画布 | `@shopify/react-native-skia` |
| 本地数据 | expo-sqlite + Drizzle ORM |
| 密钥 | expo-secure-store |
| 文件 | expo-file-system；原图、蒙版、派生图分目录 |
| 相册/相机 | expo-image-picker、expo-camera |
| 抠图 | 现成分割 API（multipart 上传，key 存 expo-secure-store；选型基准见 MVP-002） |
| 测试 | 单元/集成测试 + React Native Testing Library + Maestro 真机流程 |

初始化时锁定当日最新稳定兼容版本并提交 lockfile。不要在任务卡中追逐 nightly。

## 3. 数据与文件

- SQLite 是衣物、造型、计划、穿着记录、任务队列和推荐结果的事实源。
- 初始化启用 `WAL`、`foreign_keys` 和版本化迁移。
- SQLCipher 密钥随机生成，放入 Keychain/Keystore；禁止硬编码。
- 数据库只保存图片路径、哈希、尺寸和处理状态，不保存 Base64 原图。
- 私有目录固定为 `originals/`、`masks/`、`previews/`、`thumbnails/`、`exports/`。
- 原图只读保存；蒙版和派生图可重建。删除使用墓碑和延迟清理。
- ID 使用 UUIDv7；业务时间保存 UTC，同时记录用户时区。

## 4. 抠图与修边

定义可替换的 `SegmentationEngine`，业务层不感知具体实现。

2026-07-31 起（用户拍板）：抠图唯一路径为现成分割 API，不再做端侧 ONNX 推理；端侧模型优化退回 P2 评估。P1-002 的 iOS Vision 适配器条款同步作废。**默认实现：腾讯云数据万象 GoodsMatting 商品抠图**（2026-07-31 用户选定并已完成账号/存储桶配置；1000 次免费额度 2 个月 + ¥0.01/次按量）。备用候选：阿里云 viapi 服饰分割 SegmentCloth、百度智能抠图（调研结论见 MVP-002 证据）。

- API key 仅存设备端私有存储，不内置开发者共享 key；无 key 时抠图不可用但录入不阻塞（原图入库+待抠图状态）。
- 上传前告知上传内容、用途、保存期限；首次使用需用户明确确认（与 MVP-013 隐私开关同源）。
- 断网/API 失败时任务保持可重试状态，可跳过或手工修边，绝不伪造蒙版。

任务 MVP-002 必须用 100–200 张真实或公开衣物照片对候选 API 做基准。目标：直接可用率 ≥80%，严重失败率 ≤5%，单张端到端（含上传）目标 ≤8 秒、上限 15 秒，连续 12 张不失败不重复扣费。未达标则换候选，不得放宽阈值。

推理队列持久化到 SQLite，默认并发 1。前台处理提供即时进度；系统后台能力只作机会性续跑。App 被杀后从最后一个已提交任务恢复。上传走文件 multipart，禁止 JS 层整图 Base64 中转。

修边使用 Skia GPU 画布，保存基础 alpha 蒙版、擦除/恢复笔画和合并版本；支持缩放、画笔大小、撤销、重做和原图对照。

## 5. 推荐与智能

P0 不使用 LLM、向量数据库或云端生成式 AI。

推荐流程：

`不可用/天气/场景硬过滤 → 合法槽位组合 → 配色与正式度规则 → 偏好/久未穿/重复控制评分 → reason_codes`

- 推荐理由必须来自真实命中的规则，不生成虚假解释。
- 颜色从蒙版内像素计算 Lab 主色与分布。
- 相似衣物 P0 使用类别、感知哈希、颜色直方图和轮廓特征。
- P1 才评估 MobileCLIP 端侧向量；衣橱规模较小时直接在本地计算余弦相似度。

## 6. 天气、备份与同步

- 中国地区天气首选和风天气，Open-Meteo 作为可替换备用。
- 按城市与日期缓存，天气不可用时允许手选城市或无天气推荐。
- P0 无业务后端。完整数据导出为带清单与校验值的 `.clothesbackup`，用户保存到系统文件或自己的网盘。
- P1 才引入 Supabase Postgres + PowerSync；元数据与图片同步分离。免费云配额只用于测试，不承诺正式生产永久免费。

## 7. 目录建议

```text
apps/mobile/
  app/                 Expo Router 页面
  src/core/            数据库、文件、任务、配置
  src/domain/          领域模型、推荐规则、用例
  src/features/        按用户闭环组织
  src/design-system/   tokens 与基础组件
  src/native/          推理与平台能力适配
  e2e/
packages/
  contracts/           可序列化数据与导出格式
scripts/               验收、基准和资产检查
```

## 8. P0 非目标

- 实时多设备同步、家庭共享、造型师协作。
- 端侧抠图推理（2026-07-31 起抠图唯一路径为分割 API；端侧模型优化退回 P2 评估）。
- LLM 穿搭聊天、虚拟试衣、人物换装生成。
- Web/PWA 和桌面端。
- 自动购买、品牌广告和联盟推荐排序。

