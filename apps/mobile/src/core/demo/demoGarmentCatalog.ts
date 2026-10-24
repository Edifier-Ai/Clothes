export interface DemoGarmentAsset {
  source: number;
  originalRelPath: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/png';
}

export interface DemoGarmentCatalogItem {
  suffix: string;
  name: string;
  category: 'top' | 'bottom' | 'dress' | 'shoes' | 'outerwear' | 'accessory';
  color: string;
  material: string;
  season: string;
  occasion: string;
  formality: string;
  priceMinor: number;
  asset: DemoGarmentAsset;
}

function asset(
  suffix: string,
  source: number,
  sha256: string,
  bytes: number,
): DemoGarmentAsset {
  return {
    source,
    originalRelPath: `originals/demo-v1-${suffix}.png`,
    sha256,
    width: 1254,
    height: 1254,
    bytes,
    mimeType: 'image/png',
  };
}

/**
 * Metro 要求 require 参数为字面量，因此演示素材在这里显式登记。
 * 元数据与文件哈希一起固定，既可离线随 APK 分发，也可在重复载入时稳定判重。
 */
export const DEMO_GARMENT_CATALOG: readonly DemoGarmentCatalogItem[] = [
  { suffix: 'top-01', name: '白色亚麻衬衫', category: 'top', color: '白色', material: '亚麻', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 69900, asset: asset('top-01', require('../../../assets/demo-garments/white-linen-shirt.png'), '6fa5d3b5164bd916990478d87f81eee6c6565df0d4873dd3a24c32154dfbe881', 1464358) },
  { suffix: 'top-02', name: '海军蓝针织衫', category: 'top', color: '蓝色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '日常', priceMinor: 89900, asset: asset('top-02', require('../../../assets/demo-garments/navy-knit.png'), '81a8a665d1f0125f13c02c326c40d469fe9d677e5ef6972a90c5f02804ba1693', 1831036) },
  { suffix: 'top-03', name: '酒红真丝上衣', category: 'top', color: '酒红色', material: '真丝', season: '四季', occasion: '约会', formality: '正式', priceMinor: 129900, asset: asset('top-03', require('../../../assets/demo-garments/burgundy-blouse.png'), 'ac0b2255287e0b23a4476a05282d2b43b8a8b14d809224d22ee414cfe14596ab', 1346008) },
  { suffix: 'top-04', name: '象牙白基础 T 恤', category: 'top', color: '米白色', material: '棉', season: '春夏', occasion: '休闲', formality: '日常', priceMinor: 29900, asset: asset('top-04', require('../../../assets/demo-garments/ivory-tee.png'), '9556faca1ae99d8e4e18fe3d5fbd284a75eabfe863daf729b708b3df2992af3d', 1151665) },
  { suffix: 'top-05', name: '鼠尾草绿开衫', category: 'top', color: '绿色', material: '羊毛', season: '春秋', occasion: '日常', formality: '日常', priceMinor: 99900, asset: asset('top-05', require('../../../assets/demo-garments/sage-cardigan.png'), '05b93ceaf42fce30dc1994dde113a02a7b61e956305d59fd63d35ade82500e06', 2383104) },
  { suffix: 'top-06', name: '海魂条纹上衣', category: 'top', color: '蓝白', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 45900, asset: asset('top-06', require('../../../assets/demo-garments/breton-top.png'), '03765a9d131ee98e1377215af005c78bf90758628c30ac1e0993c197c7ce9296', 1654889) },
  { suffix: 'bottom-01', name: '黑色直筒裤', category: 'bottom', color: '黑色', material: '羊毛混纺', season: '四季', occasion: '通勤', formality: '正式', priceMinor: 79900, asset: asset('bottom-01', require('../../../assets/demo-garments/black-trousers.png'), '62c4d4838523699ea0bc152491909ef9e8504925b98df90a1095113b6462ec69', 747560) },
  { suffix: 'bottom-02', name: '沙色中长半裙', category: 'bottom', color: '米色', material: '棉混纺', season: '春夏', occasion: '日常', formality: '半正式', priceMinor: 75900, asset: asset('bottom-02', require('../../../assets/demo-garments/sand-midi-skirt.png'), '94b002032303eeeb1bd04b5acd3341aecfe746ac5c6f670e113eb5b4223612ad', 1313698) },
  { suffix: 'bottom-03', name: '深蓝直筒牛仔裤', category: 'bottom', color: '蓝色', material: '牛仔', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 65900, asset: asset('bottom-03', require('../../../assets/demo-garments/dark-jeans.png'), 'f1256c78ba09f6ffa8dbdee93b150715175962dbedde58e01090605722d9c134', 1468863) },
  { suffix: 'bottom-04', name: '橄榄绿阔腿裤', category: 'bottom', color: '绿色', material: '棉麻', season: '春夏', occasion: '旅行', formality: '日常', priceMinor: 72900, asset: asset('bottom-04', require('../../../assets/demo-garments/olive-wide-pants.png'), '52302c1faae0df0080ac521b16e67dfe5c55fb25c9aa3ccdfb45039a624e090d', 1306307) },
  { suffix: 'bottom-05', name: '炭灰百褶裙', category: 'bottom', color: '灰色', material: '羊毛混纺', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 82900, asset: asset('bottom-05', require('../../../assets/demo-garments/charcoal-pleated.png'), '4290f83f772835f487387acd2c827ddcee1f646e622e1c18448697b72eab1248', 1058388) },
  { suffix: 'dress-01', name: '墨绿收腰连衣裙', category: 'dress', color: '绿色', material: '雪纺', season: '春秋', occasion: '正式', formality: '正式', priceMinor: 149900, asset: asset('dress-01', require('../../../assets/demo-garments/emerald-dress.png'), '3087413dbed37d343a1d1b1378bfb05f4db4bdd919ca58f0bf8c21a0e7abec85', 1158314) },
  { suffix: 'dress-02', name: '黑色缎面吊带裙', category: 'dress', color: '黑色', material: '缎面', season: '春夏', occasion: '晚宴', formality: '正式', priceMinor: 139900, asset: asset('dress-02', require('../../../assets/demo-garments/black-slip-dress.png'), 'b58ae9ccc35806b7eac3383f2a240110632058b76af1800017a4b1e6b51bd7cf', 609046) },
  { suffix: 'dress-03', name: '雾蓝系带衬衫裙', category: 'dress', color: '蓝色', material: '棉', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 119900, asset: asset('dress-03', require('../../../assets/demo-garments/blue-shirt-dress.png'), '2622bcefc2bc108c5896e701ab3162f5f7da9d2ef6933e91f80eb09db3012a01', 1039615) },
  { suffix: 'outer-01', name: '驼色经典风衣', category: 'outerwear', color: '驼色', material: '棉', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 189900, asset: asset('outer-01', require('../../../assets/demo-garments/camel-trench.png'), 'dc103b01b54a6bfc418ed9126da118fd8f0c9ecc67052e3076e27c8b306f7cf7', 996415) },
  { suffix: 'outer-02', name: '炭灰修身西装', category: 'outerwear', color: '灰色', material: '羊毛', season: '四季', occasion: '商务', formality: '正式', priceMinor: 169900, asset: asset('outer-02', require('../../../assets/demo-garments/charcoal-blazer.png'), '85e41a22ea20843ce18c521ec00c06057274de0ae325c79efd1f11bfcd6f2228', 1707268) },
  { suffix: 'outer-03', name: '奶油白羊毛大衣', category: 'outerwear', color: '米白色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '正式', priceMinor: 229900, asset: asset('outer-03', require('../../../assets/demo-garments/cream-wool-coat.png'), 'b5a2da829ba75106f03314a1905ae9f36130241cdde80cf52a562aeea2f9465f', 992037) },
  { suffix: 'outer-04', name: '中蓝牛仔夹克', category: 'outerwear', color: '蓝色', material: '牛仔', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 89900, asset: asset('outer-04', require('../../../assets/demo-garments/denim-jacket.png'), '57cfb6b0ba27e690f72423f17d278d0a4fbd7603a8b9e911f0307799dce1a12f', 2521740) },
  { suffix: 'shoes-01', name: '黑色皮质乐福鞋', category: 'shoes', color: '黑色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 109900, asset: asset('shoes-01', require('../../../assets/demo-garments/black-loafers.png'), '7587acbdfa1d78facf037efe601c3ba9456027c93224262754bb464ffa110ca4', 1333631) },
  { suffix: 'shoes-02', name: '白色低帮运动鞋', category: 'shoes', color: '白色', material: '皮革', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 89900, asset: asset('shoes-02', require('../../../assets/demo-garments/white-sneakers.png'), '792a3d33a066828739fb37615eb92742a8183509565118ddd85d21f3cf05fd5e', 1127951) },
  { suffix: 'shoes-03', name: '焦糖色短靴', category: 'shoes', color: '棕色', material: '皮革', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 129900, asset: asset('shoes-03', require('../../../assets/demo-garments/tan-ankle-boots.png'), '416de2cda174ae8eede5969e86fb25c4bd25c8a4bc22a48eca886d81ff6feea5', 1598560) },
  { suffix: 'shoes-04', name: '酒红芭蕾平底鞋', category: 'shoes', color: '酒红色', material: '皮革', season: '春秋', occasion: '约会', formality: '半正式', priceMinor: 79900, asset: asset('shoes-04', require('../../../assets/demo-garments/burgundy-flats.png'), '1de09c4eddab82b23c6beab802413dda26465a61f38d37bced42ab80746680d3', 1554407) },
  { suffix: 'accessory-01', name: '香槟色真丝围巾', category: 'accessory', color: '香槟色', material: '真丝', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 39900, asset: asset('accessory-01', require('../../../assets/demo-garments/champagne-scarf.png'), 'ca5adfcf3c1588d34d75872b3e3e93528fb5cf72a23a1367c502f7e1bd028551', 979317) },
  { suffix: 'accessory-02', name: '棕色通勤托特包', category: 'accessory', color: '棕色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 159900, asset: asset('accessory-02', require('../../../assets/demo-garments/brown-tote.png'), 'beb78aeaa73b30e4c78aa344915cb9c2ad90a783873d42fbca1106389c8def20', 1520174) },
  { suffix: 'top-07', name: '浅蓝牛津纺衬衫', category: 'top', color: '浅蓝色', material: '棉', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 69900, asset: asset('top-07', require('../../../assets/demo-garments/powder-blue-oxford-shirt.png'), '6c9a89205088bbffc6cf4239cdd38d1f85dcdc290b3b89e095e1a8bf83721f6c', 1461967) },
  { suffix: 'top-08', name: '驼色羊毛高领衫', category: 'top', color: '驼色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 99900, asset: asset('top-08', require('../../../assets/demo-garments/camel-turtleneck.png'), 'ec613d109df8697a0c8ec2892147a8f6b597ae5128a770c865dd5ac6161a7660', 2026206) },
  { suffix: 'top-09', name: '灰粉雪纺上衣', category: 'top', color: '灰粉色', material: '雪纺', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 89900, asset: asset('top-09', require('../../../assets/demo-garments/dusty-rose-blouse.png'), 'da3829d9b4dfb611d69bcc5df9c3fd188b6f32c68d9c0e014d245dd5f1f3883c', 1316971) },
  { suffix: 'top-10', name: '森林绿圆领卫衣', category: 'top', color: '绿色', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 59900, asset: asset('top-10', require('../../../assets/demo-garments/forest-green-sweatshirt.png'), '6a3e15abcb0467352f9a21ee48e4b4be7bbdc3f597c63dc26838cd8a309a5c13', 1644240) },
  { suffix: 'top-11', name: '黑色方领针织上衣', category: 'top', color: '黑色', material: '针织', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 69900, asset: asset('top-11', require('../../../assets/demo-garments/black-ribbed-top.png'), '565761276b551cb90889b2cb7b3e227559319eeb3ecd0fa0a8a1495dc2b970d8', 1580026) },
  { suffix: 'top-12', name: '薰衣草紫羊绒衫', category: 'top', color: '紫色', material: '羊绒', season: '秋冬', occasion: '日常', formality: '日常', priceMinor: 119900, asset: asset('top-12', require('../../../assets/demo-garments/lavender-knit.png'), '73537649fc6d8c4892df94953d77d1ab72443c90789728d4c9a5524821c818fb', 2360386) },
  { suffix: 'top-13', name: '陶土色亚麻上衣', category: 'top', color: '陶土色', material: '亚麻', season: '春夏', occasion: '旅行', formality: '日常', priceMinor: 65900, asset: asset('top-13', require('../../../assets/demo-garments/terracotta-linen-top.png'), '3dcdf91a7d9041b1c8d7fadd1b72e9687f85b2f96a2e4b8e2449e4cf76e7612f', 1821401) },
  { suffix: 'top-14', name: '灰色连帽卫衣', category: 'top', color: '灰色', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 59900, asset: asset('top-14', require('../../../assets/demo-garments/grey-hoodie.png'), 'c3532de5f60a191ce9a9659a390a9da78748538f53cd0fc7edfb8c2d908c2c0e', 2165420) },
  { suffix: 'bottom-06', name: '象牙白阔腿裤', category: 'bottom', color: '米白色', material: '粘胶混纺', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 89900, asset: asset('bottom-06', require('../../../assets/demo-garments/ivory-wide-trousers.png'), '0dac2623a99e1f840c185f2349a135176ea7e40640b35561e204eec627985015', 653084) },
  { suffix: 'bottom-07', name: '巧克力色中长裙', category: 'bottom', color: '棕色', material: '缎面', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 82900, asset: asset('bottom-07', require('../../../assets/demo-garments/chocolate-midi-skirt.png'), '66855dad59b23ac071e7154f569b35cf3469ea5cf39d3689a36ac67cca0a10f7', 987963) },
  { suffix: 'bottom-08', name: '浅蓝直筒牛仔裤', category: 'bottom', color: '浅蓝色', material: '牛仔', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 69900, asset: asset('bottom-08', require('../../../assets/demo-garments/light-wash-jeans.png'), '8ec8be76a71f45904f3ad7313ad48a30c44cb529259754d2866361555929234c', 1222569) },
  { suffix: 'bottom-09', name: '藏蓝西装短裤', category: 'bottom', color: '藏蓝色', material: '羊毛混纺', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 75900, asset: asset('bottom-09', require('../../../assets/demo-garments/navy-tailored-shorts.png'), '69ae35c74b5387332c18073653b36c11f47d8e903299efbf795e40823be9771f', 1753351) },
  { suffix: 'bottom-10', name: '锈红灯芯绒长裤', category: 'bottom', color: '锈红色', material: '灯芯绒', season: '秋冬', occasion: '日常', formality: '日常', priceMinor: 79900, asset: asset('bottom-10', require('../../../assets/demo-garments/rust-corduroy-pants.png'), '869644eb099e32de4a640af39be5d51744a0a2ea89b4caa7925bb1d912046f1b', 1080468) },
  { suffix: 'bottom-11', name: '灰棕格纹半裙', category: 'bottom', color: '灰棕色', material: '羊毛混纺', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 89900, asset: asset('bottom-11', require('../../../assets/demo-garments/plaid-midi-skirt.png'), '0fb97bb59d6fd93339c527c8834edaa56c155d536669a155167fc5fb11e4f9db', 2180883) },
  { suffix: 'dress-04', name: '酒红裹身连衣裙', category: 'dress', color: '酒红色', material: '绉纱', season: '四季', occasion: '约会', formality: '正式', priceMinor: 139900, asset: asset('dress-04', require('../../../assets/demo-garments/burgundy-wrap-dress.png'), '67598ba9ad73cedc1c8945cf977e28fc5cc596afdd5a1c3386bc58d4837b4032', 910750) },
  { suffix: 'dress-05', name: '象牙白针织连衣裙', category: 'dress', color: '米白色', material: '针织', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 129900, asset: asset('dress-05', require('../../../assets/demo-garments/ivory-knit-dress.png'), 'e76db142f2d0ab1178ed84d43b1334ad6eac7165ed54fa007eec72babb787950', 719941) },
  { suffix: 'dress-06', name: '藏蓝 A 字连衣裙', category: 'dress', color: '藏蓝色', material: '棉混纺', season: '四季', occasion: '商务', formality: '正式', priceMinor: 129900, asset: asset('dress-06', require('../../../assets/demo-garments/navy-a-line-dress.png'), '87f1b46c31fb959b8fc738955a4d216ce457449bd979a7b5f83f9861f81c0067', 789867) },
  { suffix: 'dress-07', name: '小花印花中长裙', category: 'dress', color: '米白蓝', material: '雪纺', season: '春夏', occasion: '休闲', formality: '日常', priceMinor: 109900, asset: asset('dress-07', require('../../../assets/demo-garments/floral-midi-dress.png'), '507dddd71ebd66438a572ad42420fceffebad2ff6bc9cef85cfa046f9faca039', 1358307) },
  { suffix: 'dress-08', name: '锈橙系带衬衫裙', category: 'dress', color: '锈橙色', material: '亚麻混纺', season: '春秋', occasion: '旅行', formality: '半正式', priceMinor: 119900, asset: asset('dress-08', require('../../../assets/demo-garments/rust-shirt-dress.png'), 'eea372125d64dae63e40e15f505b32bcd5a983f4a1faa3b7f33181a72b11d0f6', 1078515) },
  { suffix: 'outer-05', name: '橄榄绿工装夹克', category: 'outerwear', color: '橄榄绿', material: '棉', season: '春秋', occasion: '旅行', formality: '日常', priceMinor: 109900, asset: asset('outer-05', require('../../../assets/demo-garments/olive-field-jacket.png'), 'bdabb1254e16c358a9b090e9122fded9fa308565f9d3bf13b1c6f6bd9f997459', 1827432) },
  { suffix: 'outer-06', name: '藏蓝羊毛大衣', category: 'outerwear', color: '藏蓝色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '正式', priceMinor: 229900, asset: asset('outer-06', require('../../../assets/demo-garments/navy-wool-coat.png'), 'b04326676b4b88aae0dcb105c51222ea06d6a16190e25686562001d054ad0727', 936960) },
  { suffix: 'outer-07', name: '酒红皮夹克', category: 'outerwear', color: '酒红色', material: '皮革', season: '春秋', occasion: '约会', formality: '半正式', priceMinor: 189900, asset: asset('outer-07', require('../../../assets/demo-garments/burgundy-leather-jacket.png'), 'cc0031e88592e65f1d6a70fc70f4af34a568bb7eca15aa1573d2c538c5c36692', 1791571) },
  { suffix: 'outer-08', name: '米色轻量羽绒服', category: 'outerwear', color: '米色', material: '羽绒', season: '秋冬', occasion: '休闲', formality: '日常', priceMinor: 159900, asset: asset('outer-08', require('../../../assets/demo-garments/beige-puffer.png'), '6d8ec3a23dab9f116b80bfe54375db5167f706e824c9da4efc6db8b54aa2fca6', 1696149) },
  { suffix: 'shoes-05', name: '棕色德比鞋', category: 'shoes', color: '棕色', material: '皮革', season: '四季', occasion: '商务', formality: '正式', priceMinor: 119900, asset: asset('shoes-05', require('../../../assets/demo-garments/brown-derby-shoes.png'), 'd87e55fe3af26d5c9e969445cd4fe2559db965d74d82412fc0ad9af1ce5d6aee', 1304859) },
  { suffix: 'shoes-06', name: '灰色跑鞋', category: 'shoes', color: '灰色', material: '织物', season: '四季', occasion: '运动', formality: '日常', priceMinor: 89900, asset: asset('shoes-06', require('../../../assets/demo-garments/grey-running-shoes.png'), 'b989af08d7b9a72c22e08b1f6d5b9ee1ad284f36a414a1ecb693258700cd4818', 1652365) },
  { suffix: 'shoes-07', name: '黑色切尔西靴', category: 'shoes', color: '黑色', material: '皮革', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 139900, asset: asset('shoes-07', require('../../../assets/demo-garments/black-chelsea-boots.png'), '784099cbef423f95a22f1b2724b2d29e01c8b97c1a7f2177d24ea1645169b626', 1361904) },
  { suffix: 'shoes-08', name: '奶油色后空跟鞋', category: 'shoes', color: '奶油色', material: '皮革', season: '春夏', occasion: '正式', formality: '正式', priceMinor: 129900, asset: asset('shoes-08', require('../../../assets/demo-garments/cream-slingback-heels.png'), '6a684a585409449bcfc0cd9e9992e21f6f4abe3b9db8411e1dc7a89c32d1a011', 912743) },
  { suffix: 'accessory-03', name: '黑色斜挎包', category: 'accessory', color: '黑色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 139900, asset: asset('accessory-03', require('../../../assets/demo-garments/black-crossbody-bag.png'), 'a540b9ff16c67db8f21c70f8cb864618ac7e7a5e05e7d19283ed6c29eca84f72', 1422061) },
  { suffix: 'accessory-04', name: '藏蓝棒球帽', category: 'accessory', color: '藏蓝色', material: '棉', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 29900, asset: asset('accessory-04', require('../../../assets/demo-garments/navy-cap.png'), 'e96dd5a27c51494a3aa4f97e26e1f346747dac88134249b999dc02dcc1a6e691', 1485546) },
  { suffix: 'accessory-05', name: '棕色金扣腰带', category: 'accessory', color: '棕色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 49900, asset: asset('accessory-05', require('../../../assets/demo-garments/gold-buckle-belt.png'), '1e3e10101fc5faf76b860405d747d86e1daf1fb6e1c6f20413d1404702466ef9', 1242057) },
];
