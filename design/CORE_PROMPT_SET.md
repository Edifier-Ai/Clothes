# 核心页面 Image Gen 提示词集

版本：V1.0  
视觉方向：3「静奢编辑部」  
视觉参考：`directions/direction-3-quiet-luxury.png`  
生成方式：Codex 内置 Image Gen  
画布目标：390 × 844 移动端 App 内容区

## 通用提示词

```text
Use case: ui-mockup.
Create one production-quality high-fidelity Chinese mobile app screen for a
privacy-first smart wardrobe product using the user's real clothes.

Use the attached "quiet luxury editorial" visual reference. Match its paper-white
background, sand surfaces, charcoal text, oxblood accent, muted-gold details,
editorial serif numerals, refined Chinese sans-serif text, fine hairlines,
restrained spacing, realistic isolated garment photography and minimal cards.

The output is app content only at a 390 x 844 portrait ratio. One screen or one
explicit full-screen state only. Keep Chinese legible and semantically correct.
Use one clear primary action. No fake brands, no placeholder copy, no emoji,
no device frame, no browser frame, no status bar, no notch, no home indicator,
no watermark, no glassmorphism, no decorative gradient and no invented feature.
When an image-processing flow is shown, make it clear that the original garment
photo is preserved.
```

## 核心页面变量

每个条目在通用提示词后追加一次，并进行一次独立生图调用。

| ID | 页面变量 |
|---|---|
| ONB-01 | 欢迎页；价值主张“每天 30 秒，穿好再出门”；真实衣物拼贴；主操作“开始整理衣橱”。 |
| ONB-02 | 三步价值说明；真实衣服、可解释推荐、本地优先；主操作“下一步”。 |
| ONB-03 | 本地与隐私；无账号可用、照片处理说明、完整导出；主操作“本地开始”。 |
| ONB-04 | 穿搭目标多选；通勤、旅行、盘活闲置、减少购买；主操作“继续”。 |
| ONB-05 | 12 件启动包；分类配额、进度、6 件可预览；主操作“添加第一件”。 |
| ONB-06 | 6 件阶段预览；显示可组合数量和首套预览；主操作“继续到 12 件”。 |
| ONB-07 | 首组搭配揭晓；真实衣物、推荐理由、克制庆祝；主操作“进入今日”。 |
| IMP-01 | 导入来源；连续拍摄、从相册批量导入、稍后添加；主操作“从相册选择”。 |
| IMP-02 | 12 张缩略图批量队列；进度、失败重试；主操作“开始处理”。 |
| IMP-03 | 自动抠图审核；原图/抠图对照、边缘置信度、保留原图；主操作“看起来不错”。 |
| IMP-04 | 手工蒙版修边；擦除/恢复、画笔、撤销、原图预览；主操作“保存蒙版”。 |
| IMP-05 | 单品信息确认；类别、颜色、季节、场景，只突出低置信字段；主操作“保存并继续”。 |
| TDY-01 | 今日默认页；天气/场景、完整真实搭配、2–3 条理由；主操作“就穿这套”；底栏为今天/衣橱/造型/计划。 |
| TDY-02 | 推荐理由详情；硬约束、偏好、久未穿、为何没选其他单品；主操作“知道了”。 |
| TDY-03 | 只换一件；固定其余槽位，显示同槽候选和即时预览；主操作“换成这件”。 |
| TDY-04 | 换一套；保留已喜欢单品、显示新组合与跳过原因；主操作“使用新搭配”。 |
| TDY-05 | 推荐模式；稳妥、新鲜、主角单品、赶时间、天气变化；主操作“应用模式”。 |
| TDY-06 | 记录已穿；时间、场景、舒适度快速反馈；主操作“完成记录”。 |
| TDY-07 | 穿后状态；需要送洗的单品、保持干净、稍后处理；主操作“更新状态”。 |
| TDY-08 | 天气权限不可用；手选城市、仅本次使用、不阻塞推荐；主操作“手动选择城市”。 |
| CLS-01 | 衣橱首页；分类、总件数、搜索筛选、真实衣物网格；主操作“添加衣物”；衣橱底栏高亮。 |
| CLS-03 | 单品详情；抠图大图、穿着次数、成本/次、使用造型、当前状态；主操作“加入造型”。 |
| LOK-03 | 自由造型画布；多件真实衣物拼贴，移动/缩放/旋转/层级工具；主操作“完成”。 |
| PLN-01 | 2026 年 7 月月历，周一开始，今天 7 月 27 日高亮，每日造型缩略图；主操作“添加计划”。 |
| TRP-05 | 巴黎 5 天去重打包清单；按类别、已打包勾选、缺失提醒；主操作“标记全部完成”。 |
| STA-01 | 统计总览；穿着天数、盘活单品、成本/次、颜色构成、趋势；主操作“查看衣橱洞察”。 |
| SHP-02 | 相似单品提醒；候选商品与衣橱内三件相似实物、差异解释；主操作“查看可搭组合”。 |
| SET-01 | 设置首页；个人偏好、同步、AI、通知、数据、订阅；主操作“管理同步”。 |
| SET-05 | AI 与照片隐私；端侧/云端逐项开关、保存期限、供应商说明；主操作“保存选择”。 |

## 一致性约束

- 所有页面共享同一视觉参考，不混用其他方向。
- 主导航只有 `今天 / 衣橱 / 造型 / 计划`。
- 日期锚点为 2026-07-27。
- 衣物使用无人物、无虚构品牌的真实棚拍抠图。
- 每张图均应在落盘后检查中文、裁切、重复导航、主操作和页面语义。

