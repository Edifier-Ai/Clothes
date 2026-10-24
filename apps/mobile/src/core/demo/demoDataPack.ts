import { SHOPPING_ALGORITHM_VERSION } from '@/core/shopping/types';

import { DEMO_GARMENT_CATALOG, type DemoGarmentAsset, type DemoGarmentCatalogItem } from './demoGarmentCatalog';

const DEMO_PREFIX = 'demo-v1-';

export interface DemoSqlExecutor {
  transaction(work: () => Promise<void>): Promise<void>;
  run(sql: string, params: readonly (string | number | null)[]): Promise<void>;
}

interface DemoGarment {
  id: string;
  name: string;
  category: string;
  status: string;
  priceMinor: number;
  currency: string;
  purchaseDate: string;
  createdAt: number;
  updatedAt: number;
  tags: readonly { kind: string; value: string }[];
  asset: DemoGarmentAsset;
}

interface DemoLook {
  id: string;
  name: string;
  mode: 'slots';
  createdAt: number;
  updatedAt: number;
  items: readonly {
    id: string;
    garmentId: string;
    slot: string;
    ord: number;
    x: number;
    y: number;
    scale: number;
  }[];
}

interface DemoPlan {
  id: string;
  date: string;
  timeLabel: string;
  occasion: string;
  lookId: string;
  garmentIds: readonly string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

interface DemoWearLog {
  id: string;
  recommendationId: string;
  date: string;
  occasion: string;
  comfort: string;
  note: string | null;
  createdAt: number;
  items: readonly { id: string; garmentId: string; slot: string; ord: number }[];
}

interface DemoShoppingCandidate {
  id: string;
  name: string;
  category: string;
  priceMinor: number;
  currency: string;
  algorithmVersion: string;
  resultsJson: string;
  compatibilityJson: string;
  assumedWears: number;
  verdict: string;
  analysisState: string;
  createdAt: number;
  updatedAt: number;
}

export interface DemoDataPack {
  version: 3;
  anchorDate: string;
  garments: readonly DemoGarment[];
  looks: readonly DemoLook[];
  plans: readonly DemoPlan[];
  wearLogs: readonly DemoWearLog[];
  shoppingCandidates: readonly DemoShoppingCandidate[];
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function timestamp(date: string, hour = 12): number {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

function garment(
  item: DemoGarmentCatalogItem,
  anchorDate: string,
  index: number,
): DemoGarment {
  const createdAt = timestamp(shiftDate(anchorDate, -150 + index));
  return {
    id: `${DEMO_PREFIX}${item.suffix}`,
    name: item.name,
    category: item.category,
    status: 'clean',
    priceMinor: item.priceMinor,
    currency: 'CNY',
    purchaseDate: shiftDate(anchorDate, -150 + index),
    createdAt,
    updatedAt: createdAt,
    tags: [
      { kind: 'color', value: item.color },
      { kind: 'season', value: item.season },
      { kind: 'occasion', value: item.occasion },
      { kind: 'material', value: item.material },
      { kind: 'formality', value: item.formality },
    ],
    asset: item.asset,
  };
}

function look(
  suffix: string,
  name: string,
  anchorDate: string,
  slots: readonly [string, string][],
): DemoLook {
  const id = `${DEMO_PREFIX}look-${suffix}`;
  const createdAt = timestamp(shiftDate(anchorDate, -20));
  const geometry: Record<string, { x: number; y: number; scale: number }> = {
    top: { x: 0.3, y: 0.24, scale: 0.3 },
    bottom: { x: 0.3, y: 0.57, scale: 0.3 },
    shoes: { x: 0.3, y: 0.82, scale: 0.22 },
    outerwear: { x: 0.72, y: 0.32, scale: 0.32 },
    accessory: { x: 0.72, y: 0.72, scale: 0.19 },
    dress: { x: 0.34, y: 0.43, scale: 0.38 },
  };
  return {
    id,
    name,
    mode: 'slots',
    createdAt,
    updatedAt: createdAt,
    items: slots.map(([slot, garmentSuffix], ord) => {
      const itemGeometry = geometry[slot] ?? { x: 0.5, y: 0.5, scale: 0.28 };
      return {
        id: `${id}-item-${ord}`,
        garmentId: `${DEMO_PREFIX}${garmentSuffix}`,
        slot,
        ord,
        ...itemGeometry,
      };
    }),
  };
}

function wearLog(
  index: number,
  anchorDate: string,
  garmentSuffixes: readonly [string, string][],
): DemoWearLog {
  const date = shiftDate(anchorDate, -(index + 2));
  const id = `${DEMO_PREFIX}wear-${String(index + 1).padStart(2, '0')}`;
  return {
    id,
    recommendationId: `${DEMO_PREFIX}recommendation-${String(index + 1).padStart(2, '0')}`,
    date,
    occasion: index % 3 === 0 ? 'commute' : index % 3 === 1 ? 'casual' : 'formal',
    comfort: index === 5 ? 'ok' : 'good',
    note: index === 0 ? '演示穿着记录' : null,
    createdAt: timestamp(date, 18),
    items: garmentSuffixes.map(([slot, suffix], ord) => ({
      id: `${id}-item-${ord}`,
      garmentId: `${DEMO_PREFIX}${suffix}`,
      slot,
      ord,
    })),
  };
}

export function buildDemoDataPack(anchorDate: string): DemoDataPack {
  const garments = DEMO_GARMENT_CATALOG.map((item, index) => garment(item, anchorDate, index + 1));

  const looks = [
    look('work', '周一 · 安静通勤', anchorDate, [
      ['top', 'top-01'], ['bottom', 'bottom-01'], ['shoes', 'shoes-01'], ['outerwear', 'outer-01'],
    ]),
    look('weekend', '周末 · 松弛层次', anchorDate, [
      ['top', 'top-02'], ['bottom', 'bottom-03'], ['shoes', 'shoes-02'], ['accessory', 'accessory-01'],
    ]),
    look('dinner', '晚餐 · 酒红点题', anchorDate, [
      ['top', 'top-03'], ['bottom', 'bottom-02'], ['shoes', 'shoes-01'], ['outerwear', 'outer-02'],
    ]),
    look('soft-work', '晨会 · 柔和力量', anchorDate, [
      ['top', 'top-04'], ['bottom', 'bottom-05'], ['shoes', 'shoes-04'], ['outerwear', 'outer-02'], ['accessory', 'accessory-02'],
    ]),
    look('gallery', '看展 · 雾蓝留白', anchorDate, [
      ['dress', 'dress-03'], ['shoes', 'shoes-04'], ['accessory', 'accessory-01'],
    ]),
    look('city-walk', '城市漫步 · 海岸条纹', anchorDate, [
      ['top', 'top-06'], ['bottom', 'bottom-04'], ['shoes', 'shoes-02'], ['outerwear', 'outer-04'],
    ]),
    look('green-evening', '庆祝时刻 · 墨绿焦点', anchorDate, [
      ['dress', 'dress-01'], ['shoes', 'shoes-01'], ['accessory', 'accessory-02'],
    ]),
    look('black-evening', '夜间约会 · 极简缎光', anchorDate, [
      ['dress', 'dress-02'], ['shoes', 'shoes-04'], ['outerwear', 'outer-03'],
    ]),
    look('rainy-commute', '微凉通勤 · 奶油层次', anchorDate, [
      ['top', 'top-02'], ['bottom', 'bottom-01'], ['shoes', 'shoes-03'], ['outerwear', 'outer-03'], ['accessory', 'accessory-01'],
    ]),
    look('denim-day', '周五 · 丹宁松弛感', anchorDate, [
      ['top', 'top-04'], ['bottom', 'bottom-03'], ['shoes', 'shoes-02'], ['outerwear', 'outer-04'],
    ]),
    look('sage-weekend', '周末早午餐 · 鼠尾草绿', anchorDate, [
      ['top', 'top-05'], ['bottom', 'bottom-02'], ['shoes', 'shoes-04'], ['accessory', 'accessory-02'],
    ]),
    look('presentation', '重要汇报 · 清晰轮廓', anchorDate, [
      ['top', 'top-01'], ['bottom', 'bottom-01'], ['shoes', 'shoes-01'], ['outerwear', 'outer-02'], ['accessory', 'accessory-02'],
    ]),
    look('blue-boardroom', '董事会 · 静谧蓝调', anchorDate, [
      ['top', 'top-07'], ['bottom', 'bottom-06'], ['shoes', 'shoes-05'], ['outerwear', 'outer-06'], ['accessory', 'accessory-03'],
    ]),
    look('active-weekend', '活力周末 · 森林呼吸', anchorDate, [
      ['top', 'top-10'], ['bottom', 'bottom-08'], ['shoes', 'shoes-06'], ['outerwear', 'outer-05'], ['accessory', 'accessory-04'],
    ]),
    look('burgundy-date', '约会 · 酒红与柔粉', anchorDate, [
      ['top', 'top-09'], ['bottom', 'bottom-07'], ['shoes', 'shoes-08'], ['outerwear', 'outer-07'], ['accessory', 'accessory-03'],
    ]),
    look('autumn-layer', '初冬 · 驼色层次', anchorDate, [
      ['top', 'top-08'], ['bottom', 'bottom-10'], ['shoes', 'shoes-07'], ['outerwear', 'outer-08'], ['accessory', 'accessory-05'],
    ]),
    look('spring-floral', '春日邀约 · 轻盈碎花', anchorDate, [
      ['dress', 'dress-07'], ['shoes', 'shoes-08'], ['accessory', 'accessory-03'],
    ]),
    look('rust-travel', '旅行日 · 陶土暖调', anchorDate, [
      ['dress', 'dress-08'], ['shoes', 'shoes-07'], ['outerwear', 'outer-05'], ['accessory', 'accessory-05'],
    ]),
  ];

  const plans: DemoPlan[] = [
    {
      id: `${DEMO_PREFIX}plan-today`, date: anchorDate, timeLabel: '白天', occasion: 'commute',
      lookId: `${DEMO_PREFIX}look-work`, garmentIds: looks[0].items.map((item) => item.garmentId),
      note: '上午汇报 · 下班后咖啡', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-tomorrow`, date: shiftDate(anchorDate, 1), timeLabel: '晚餐', occasion: 'formal',
      lookId: `${DEMO_PREFIX}look-dinner`, garmentIds: looks[2].items.map((item) => item.garmentId),
      note: '预约晚餐', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-weekend`, date: shiftDate(anchorDate, 3), timeLabel: '午后', occasion: 'casual',
      lookId: `${DEMO_PREFIX}look-weekend`, garmentIds: looks[1].items.map((item) => item.garmentId),
      note: '城市散步', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-gallery`, date: shiftDate(anchorDate, 2), timeLabel: '傍晚', occasion: 'casual',
      lookId: `${DEMO_PREFIX}look-gallery`, garmentIds: looks[4].items.map((item) => item.garmentId),
      note: '新展预览', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-presentation`, date: shiftDate(anchorDate, 5), timeLabel: '上午', occasion: 'formal',
      lookId: `${DEMO_PREFIX}look-presentation`, garmentIds: looks[11].items.map((item) => item.garmentId),
      note: '季度汇报', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-floral`, date: shiftDate(anchorDate, 4), timeLabel: '午后', occasion: 'casual',
      lookId: `${DEMO_PREFIX}look-spring-floral`, garmentIds: looks[16].items.map((item) => item.garmentId),
      note: '朋友花园聚会', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
    {
      id: `${DEMO_PREFIX}plan-autumn`, date: shiftDate(anchorDate, 6), timeLabel: '全天', occasion: 'commute',
      lookId: `${DEMO_PREFIX}look-autumn-layer`, garmentIds: looks[15].items.map((item) => item.garmentId),
      note: '降温日程', createdAt: timestamp(anchorDate, 8), updatedAt: timestamp(anchorDate, 8),
    },
  ];

  const wearPatterns: readonly (readonly [string, string][])[] = [
    [['top', 'top-01'], ['bottom', 'bottom-01'], ['shoes', 'shoes-01'], ['outerwear', 'outer-01']],
    [['top', 'top-02'], ['bottom', 'bottom-03'], ['shoes', 'shoes-02']],
    [['top', 'top-03'], ['bottom', 'bottom-02'], ['shoes', 'shoes-01'], ['outerwear', 'outer-02']],
    [['dress', 'dress-01'], ['shoes', 'shoes-01']],
    [['top', 'top-01'], ['bottom', 'bottom-02'], ['shoes', 'shoes-02']],
    [['top', 'top-02'], ['bottom', 'bottom-01'], ['shoes', 'shoes-01'], ['outerwear', 'outer-01']],
    [['top', 'top-03'], ['bottom', 'bottom-03'], ['shoes', 'shoes-02']],
    [['top', 'top-01'], ['bottom', 'bottom-01'], ['shoes', 'shoes-01'], ['outerwear', 'outer-02']],
    [['top', 'top-04'], ['bottom', 'bottom-03'], ['shoes', 'shoes-02'], ['outerwear', 'outer-04']],
    [['top', 'top-05'], ['bottom', 'bottom-02'], ['shoes', 'shoes-04'], ['accessory', 'accessory-02']],
    [['dress', 'dress-03'], ['shoes', 'shoes-04'], ['accessory', 'accessory-01']],
    [['top', 'top-06'], ['bottom', 'bottom-04'], ['shoes', 'shoes-02'], ['outerwear', 'outer-04']],
    [['dress', 'dress-02'], ['shoes', 'shoes-04'], ['outerwear', 'outer-03']],
    [['top', 'top-02'], ['bottom', 'bottom-05'], ['shoes', 'shoes-03'], ['outerwear', 'outer-03']],
    [['top', 'top-07'], ['bottom', 'bottom-06'], ['shoes', 'shoes-05'], ['outerwear', 'outer-06'], ['accessory', 'accessory-03']],
    [['top', 'top-10'], ['bottom', 'bottom-08'], ['shoes', 'shoes-06'], ['outerwear', 'outer-05'], ['accessory', 'accessory-04']],
    [['top', 'top-09'], ['bottom', 'bottom-07'], ['shoes', 'shoes-08'], ['outerwear', 'outer-07']],
    [['top', 'top-08'], ['bottom', 'bottom-10'], ['shoes', 'shoes-07'], ['outerwear', 'outer-08'], ['accessory', 'accessory-05']],
    [['dress', 'dress-07'], ['shoes', 'shoes-08'], ['accessory', 'accessory-03']],
    [['dress', 'dress-08'], ['shoes', 'shoes-07'], ['outerwear', 'outer-05'], ['accessory', 'accessory-05']],
  ];
  const wearLogs = wearPatterns.map((pattern, index) => wearLog(index, anchorDate, pattern));

  const compatibility = {
    version: SHOPPING_ALGORITHM_VERSION,
    total: 6,
    items: [
      {
        id: 'top:$candidate|bottom:demo-v1-bottom-01|shoes:demo-v1-shoes-01|outerwear:demo-v1-outer-01',
        candidateSlot: 'top',
        items: [
          { garmentId: `${DEMO_PREFIX}bottom-01`, name: '黑色直筒裤', category: 'bottom', imageRelPath: 'originals/demo-v1-bottom-01.png' },
          { garmentId: `${DEMO_PREFIX}shoes-01`, name: '黑色皮质乐福鞋', category: 'shoes', imageRelPath: 'originals/demo-v1-shoes-01.png' },
          { garmentId: `${DEMO_PREFIX}outer-01`, name: '驼色经典风衣', category: 'outerwear', imageRelPath: 'originals/demo-v1-outer-01.png' },
        ],
      },
    ],
  };

  return {
    version: 3,
    anchorDate,
    garments,
    looks,
    plans,
    wearLogs,
    shoppingCandidates: [
      {
        id: `${DEMO_PREFIX}shopping-cardigan`, name: '燕麦色羊毛开衫', category: 'top', priceMinor: 129900,
        currency: 'CNY', algorithmVersion: SHOPPING_ALGORITHM_VERSION,
        resultsJson: JSON.stringify({ version: SHOPPING_ALGORITHM_VERSION, items: [] }),
        compatibilityJson: JSON.stringify(compatibility), assumedWears: 30, verdict: 'considering',
        analysisState: 'ready', createdAt: timestamp(anchorDate, 9), updatedAt: timestamp(anchorDate, 9),
      },
    ],
  };
}

export async function applyDemoDataPack(
  db: DemoSqlExecutor,
  pack: DemoDataPack,
): Promise<void> {
  await db.transaction(async () => {
    const clearStatements = [
      `DELETE FROM wear_log_items WHERE wear_log_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM wear_logs WHERE id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM plans WHERE id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM look_items WHERE look_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM shopping_candidates WHERE id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM garment_status_events WHERE garment_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM mask_strokes WHERE garment_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM cutout_jobs WHERE garment_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM garment_tags WHERE garment_id LIKE '${DEMO_PREFIX}%'`,
      `DELETE FROM garment_assets WHERE garment_id LIKE '${DEMO_PREFIX}%'`,
    ];
    for (const sql of clearStatements) await db.run(sql, []);

    for (const item of pack.garments) {
      await db.run(
        `INSERT INTO garments(id,name,category,status,price_minor,currency,purchase_date,archived_at,deleted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,status=excluded.status,price_minor=excluded.price_minor,currency=excluded.currency,purchase_date=excluded.purchase_date,archived_at=NULL,deleted_at=NULL,updated_at=excluded.updated_at`,
        [item.id, item.name, item.category, item.status, item.priceMinor, item.currency, item.purchaseDate, null, null, item.createdAt, item.updatedAt],
      );
      for (const [index, tag] of item.tags.entries()) {
        await db.run(
          `INSERT INTO garment_tags(id,garment_id,kind,value,confidence) VALUES(?,?,?,?,?)`,
          [`${item.id}-tag-${index}`, item.id, tag.kind, tag.value, 1],
        );
      }
      await db.run(
        `INSERT INTO garment_assets(id,garment_id,original_rel_path,sha256,width,height,bytes,mime_type,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        [`${item.id}-asset-original`, item.id, item.asset.originalRelPath, item.asset.sha256, item.asset.width, item.asset.height, item.asset.bytes, item.asset.mimeType, item.createdAt],
      );
    }

    for (const lookItem of pack.looks) {
      await db.run(
        `INSERT INTO looks(id,name,mode,source_look_id,cover_rel_path,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,source_look_id=NULL,cover_rel_path=NULL,updated_at=excluded.updated_at,deleted_at=NULL`,
        [lookItem.id, lookItem.name, lookItem.mode, null, null, lookItem.createdAt, lookItem.updatedAt, null],
      );
      for (const item of lookItem.items) {
        await db.run(
          `INSERT INTO look_items(id,look_id,garment_id,slot,x,y,scale,rotation,z_index,ord) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [item.id, lookItem.id, item.garmentId, item.slot, item.x, item.y, item.scale, 0, item.ord, item.ord],
        );
      }
    }

    for (const plan of pack.plans) {
      await db.run(
        `INSERT INTO plans(id,date,time_label,occasion,look_id,outfit_json,note,status,completed_at,change_note,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [plan.id, plan.date, plan.timeLabel, plan.occasion, plan.lookId, JSON.stringify(plan.garmentIds), plan.note, 'planned', null, null, plan.createdAt, plan.updatedAt, null],
      );
    }

    for (const log of pack.wearLogs) {
      await db.run(
        `INSERT INTO wear_logs(id,recommendation_id,date,occasion,comfort,note,created_at) VALUES(?,?,?,?,?,?,?)`,
        [log.id, log.recommendationId, log.date, log.occasion, log.comfort, log.note, log.createdAt],
      );
      for (const item of log.items) {
        await db.run(
          `INSERT INTO wear_log_items(id,wear_log_id,garment_id,slot,ord) VALUES(?,?,?,?,?)`,
          [item.id, log.id, item.garmentId, item.slot, item.ord],
        );
      }
    }

    for (const candidate of pack.shoppingCandidates) {
      await db.run(
        `INSERT INTO shopping_candidates(id,name,category,price_minor,currency,product_url,image_rel_path,image_sha256,algorithm_version,features_json,results_json,compatibility_json,assumed_wears,verdict,analysis_state,last_error,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [candidate.id, candidate.name, candidate.category, candidate.priceMinor, candidate.currency, null, null, null, candidate.algorithmVersion, null, candidate.resultsJson, candidate.compatibilityJson, candidate.assumedWears, candidate.verdict, candidate.analysisState, null, candidate.createdAt, candidate.updatedAt, null],
      );
    }
  });
}
