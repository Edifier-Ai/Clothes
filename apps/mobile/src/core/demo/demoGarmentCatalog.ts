export interface DemoGarmentAsset {
  source: number;
  originalRelPath: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/webp';
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
    originalRelPath: `originals/demo-v1-${suffix}.webp`,
    sha256,
    width: 1024,
    height: 1024,
    bytes,
    mimeType: 'image/webp',
  };
}

/**
 * Metro 要求 require 参数为字面量，因此演示素材在这里显式登记。
 * 元数据与文件哈希一起固定，既可离线随 APK 分发，也可在重复载入时稳定判重。
 */
export const DEMO_GARMENT_CATALOG: readonly DemoGarmentCatalogItem[] = [
  { suffix: 'top-01', name: '白色亚麻衬衫', category: 'top', color: '白色', material: '亚麻', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 69900, asset: asset('top-01', require('../../../assets/demo-garments/white-linen-shirt.webp'), 'b9fe1908a2382ff06072e3a3fece27e3a8d8f3d234abda7b4a529298872ddb32', 46788) },
  { suffix: 'top-02', name: '海军蓝针织衫', category: 'top', color: '蓝色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '日常', priceMinor: 89900, asset: asset('top-02', require('../../../assets/demo-garments/navy-knit.webp'), 'b697903cd4cfe3bf4f1e69e54ba906b47c985b7659d0929d0fae62ef77354af7', 47986) },
  { suffix: 'top-03', name: '酒红真丝上衣', category: 'top', color: '酒红色', material: '真丝', season: '四季', occasion: '约会', formality: '正式', priceMinor: 129900, asset: asset('top-03', require('../../../assets/demo-garments/burgundy-blouse.webp'), 'cb8a219ed5603992d8f522f510552b207615cb9bc3c2922b9a0e2638522eb0e7', 53758) },
  { suffix: 'top-04', name: '象牙白基础 T 恤', category: 'top', color: '米白色', material: '棉', season: '春夏', occasion: '休闲', formality: '日常', priceMinor: 29900, asset: asset('top-04', require('../../../assets/demo-garments/ivory-tee.webp'), 'af1dcfcab76cf269150f74483d15aa175265bc99203af7df45eca5487e409fb1', 30196) },
  { suffix: 'top-05', name: '鼠尾草绿开衫', category: 'top', color: '绿色', material: '羊毛', season: '春秋', occasion: '日常', formality: '日常', priceMinor: 99900, asset: asset('top-05', require('../../../assets/demo-garments/sage-cardigan.webp'), '9e5cf0b06ad295aeeb537e0edf73db58da9bcdd7feb96646584b69fe7b4690c4', 99236) },
  { suffix: 'top-06', name: '海魂条纹上衣', category: 'top', color: '蓝白', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 45900, asset: asset('top-06', require('../../../assets/demo-garments/breton-top.webp'), '378b2f2d845a1644d4b6b9aca83cd6bd6d54d5719cbd9c3d1c13ba48bdc7a529', 72582) },
  { suffix: 'bottom-01', name: '黑色直筒裤', category: 'bottom', color: '黑色', material: '羊毛混纺', season: '四季', occasion: '通勤', formality: '正式', priceMinor: 79900, asset: asset('bottom-01', require('../../../assets/demo-garments/black-trousers.webp'), '2f18f2489c49f47bd92dd7a2a4ed293c54d9b296f61ae853c7beabf199b0222f', 25884) },
  { suffix: 'bottom-02', name: '沙色中长半裙', category: 'bottom', color: '米色', material: '棉混纺', season: '春夏', occasion: '日常', formality: '半正式', priceMinor: 75900, asset: asset('bottom-02', require('../../../assets/demo-garments/sand-midi-skirt.webp'), '484bd72a9a849a3040d7d806e77f119918d77cda3fb8567c5205fe8d1efb5839', 37348) },
  { suffix: 'bottom-03', name: '深蓝直筒牛仔裤', category: 'bottom', color: '蓝色', material: '牛仔', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 65900, asset: asset('bottom-03', require('../../../assets/demo-garments/dark-jeans.webp'), '7e7ea20e5a9087bc5c026d5de62209088e52a76b0b8668e42ea6f13135167885', 68348) },
  { suffix: 'bottom-04', name: '橄榄绿阔腿裤', category: 'bottom', color: '绿色', material: '棉麻', season: '春夏', occasion: '旅行', formality: '日常', priceMinor: 72900, asset: asset('bottom-04', require('../../../assets/demo-garments/olive-wide-pants.webp'), 'aaea66f06a1ba1bacc8dfd76919bd333566dad4e19ca11775d280311e97dbf45', 42000) },
  { suffix: 'bottom-05', name: '炭灰百褶裙', category: 'bottom', color: '灰色', material: '羊毛混纺', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 82900, asset: asset('bottom-05', require('../../../assets/demo-garments/charcoal-pleated.webp'), 'ba6cda1169bba15fc64f53f4d2d5b9eb04cf73569c2872ab3bf0528d35b1687d', 35834) },
  { suffix: 'dress-01', name: '墨绿收腰连衣裙', category: 'dress', color: '绿色', material: '雪纺', season: '春秋', occasion: '正式', formality: '正式', priceMinor: 149900, asset: asset('dress-01', require('../../../assets/demo-garments/emerald-dress.webp'), '72b4b9d09f2c66d2917f2ed85a60dd58da1b7ceff5bd5796cc2cc7d781a5f690', 46660) },
  { suffix: 'dress-02', name: '黑色缎面吊带裙', category: 'dress', color: '黑色', material: '缎面', season: '春夏', occasion: '晚宴', formality: '正式', priceMinor: 139900, asset: asset('dress-02', require('../../../assets/demo-garments/black-slip-dress.webp'), 'd271b562fba9cc46f1dd3d8b1e182e770fca309d79e96ad59d6f54670e8e21cb', 28138) },
  { suffix: 'dress-03', name: '雾蓝系带衬衫裙', category: 'dress', color: '蓝色', material: '棉', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 119900, asset: asset('dress-03', require('../../../assets/demo-garments/blue-shirt-dress.webp'), '614e59e34f8d0914fe0ecc8358a2dd063e6f1556de98782f86388386e0cafa6c', 45104) },
  { suffix: 'outer-01', name: '驼色经典风衣', category: 'outerwear', color: '驼色', material: '棉', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 189900, asset: asset('outer-01', require('../../../assets/demo-garments/camel-trench.webp'), 'c256fecfe3454f2974b1eb0ceab4e5f3d69be2701e14b63789f39341af32e301', 46262) },
  { suffix: 'outer-02', name: '炭灰修身西装', category: 'outerwear', color: '灰色', material: '羊毛', season: '四季', occasion: '商务', formality: '正式', priceMinor: 169900, asset: asset('outer-02', require('../../../assets/demo-garments/charcoal-blazer.webp'), 'cbb7f262f9a549ed6b36df0970a8465c5700a8e224aa1bc30ced87652ef58186', 53838) },
  { suffix: 'outer-03', name: '奶油白羊毛大衣', category: 'outerwear', color: '米白色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '正式', priceMinor: 229900, asset: asset('outer-03', require('../../../assets/demo-garments/cream-wool-coat.webp'), '8cf274e1660ac48ffe1d306a4ad6f5f81bb5741d47297a89fd9d9e954bfd33c0', 40722) },
  { suffix: 'outer-04', name: '中蓝牛仔夹克', category: 'outerwear', color: '蓝色', material: '牛仔', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 89900, asset: asset('outer-04', require('../../../assets/demo-garments/denim-jacket.webp'), '7c00db0e5eb9197e95cbaada32fb036e8a0ae1841492ddedebff6f334634c8fa', 149980) },
  { suffix: 'shoes-01', name: '黑色皮质乐福鞋', category: 'shoes', color: '黑色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 109900, asset: asset('shoes-01', require('../../../assets/demo-garments/black-loafers.webp'), 'ed6390b0e39f1b7222c7f8739f3373985e808c92b7102ce926a1ab622df34c5f', 54510) },
  { suffix: 'shoes-02', name: '白色低帮运动鞋', category: 'shoes', color: '白色', material: '皮革', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 89900, asset: asset('shoes-02', require('../../../assets/demo-garments/white-sneakers.webp'), '79706f7fd6fb7e464bd08095c916e92c1864e9726334c2b8d57b5be1d1735769', 41842) },
  { suffix: 'shoes-03', name: '焦糖色短靴', category: 'shoes', color: '棕色', material: '皮革', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 129900, asset: asset('shoes-03', require('../../../assets/demo-garments/tan-ankle-boots.webp'), 'b6ca9570af4f6b709ee52537bd4312911d84063b75fa095fe7d5c1464008a022', 62264) },
  { suffix: 'shoes-04', name: '酒红芭蕾平底鞋', category: 'shoes', color: '酒红色', material: '皮革', season: '春秋', occasion: '约会', formality: '半正式', priceMinor: 79900, asset: asset('shoes-04', require('../../../assets/demo-garments/burgundy-flats.webp'), 'c347d48280db438b791fd1e2e5b1f4c3f363a73cce7b7328b569dda1b8c81809', 71784) },
  { suffix: 'accessory-01', name: '香槟色真丝围巾', category: 'accessory', color: '香槟色', material: '真丝', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 39900, asset: asset('accessory-01', require('../../../assets/demo-garments/champagne-scarf.webp'), '483a62a2ee50bcb96161e6af00ee950748f89b4cdc7221eb076ad830d0680a94', 61336) },
  { suffix: 'accessory-02', name: '棕色通勤托特包', category: 'accessory', color: '棕色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 159900, asset: asset('accessory-02', require('../../../assets/demo-garments/brown-tote.webp'), '2fa7a6ecf6e4555248d1d1dde77715fefdc819c8424d03a35e94966f8dd314a1', 77336) },
  { suffix: 'top-07', name: '浅蓝牛津纺衬衫', category: 'top', color: '浅蓝色', material: '棉', season: '春秋', occasion: '通勤', formality: '半正式', priceMinor: 69900, asset: asset('top-07', require('../../../assets/demo-garments/powder-blue-oxford-shirt.webp'), '0c68593455c182c19901ffb19489601bd0141bcc1e003037b6664ebc5171cbcf', 48710) },
  { suffix: 'top-08', name: '驼色羊毛高领衫', category: 'top', color: '驼色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 99900, asset: asset('top-08', require('../../../assets/demo-garments/camel-turtleneck.webp'), '4bbcec03c65abdb0e2d3dd1aa48303c096485792201319d7d6d74af17d289f4d', 84570) },
  { suffix: 'top-09', name: '灰粉雪纺上衣', category: 'top', color: '灰粉色', material: '雪纺', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 89900, asset: asset('top-09', require('../../../assets/demo-garments/dusty-rose-blouse.webp'), 'defe57db226b91bfff17b1f0a14ee6017f1e37478ad45247f0567d9962e6c133', 52556) },
  { suffix: 'top-10', name: '森林绿圆领卫衣', category: 'top', color: '绿色', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 59900, asset: asset('top-10', require('../../../assets/demo-garments/forest-green-sweatshirt.webp'), '13f24de4a29a0b63d55329210a9dea9ad5b7206248701d62e8dff3da69258a14', 40188) },
  { suffix: 'top-11', name: '黑色方领针织上衣', category: 'top', color: '黑色', material: '针织', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 69900, asset: asset('top-11', require('../../../assets/demo-garments/black-ribbed-top.webp'), '871b3b840cf7aff0a75f791ccd5a296c466dd2d243bb711b2a8f2745b7a65277', 54680) },
  { suffix: 'top-12', name: '薰衣草紫羊绒衫', category: 'top', color: '紫色', material: '羊绒', season: '秋冬', occasion: '日常', formality: '日常', priceMinor: 119900, asset: asset('top-12', require('../../../assets/demo-garments/lavender-knit.webp'), 'ce15e7ef5e5a1d6b93b5a43d2399324719c367128f4aae38077114f90339d1d1', 84632) },
  { suffix: 'top-13', name: '陶土色亚麻上衣', category: 'top', color: '陶土色', material: '亚麻', season: '春夏', occasion: '旅行', formality: '日常', priceMinor: 65900, asset: asset('top-13', require('../../../assets/demo-garments/terracotta-linen-top.webp'), '782f76af397d7f912baa000f4dceb8271220124a153cbeab00b60c07cc8c8f03', 58140) },
  { suffix: 'top-14', name: '灰色连帽卫衣', category: 'top', color: '灰色', material: '棉', season: '春秋', occasion: '休闲', formality: '日常', priceMinor: 59900, asset: asset('top-14', require('../../../assets/demo-garments/grey-hoodie.webp'), 'dc045450ae0ad81863f66932397ed3edb1d7ad73ba5a801ec71e2ed2d68c5bc5', 79598) },
  { suffix: 'bottom-06', name: '象牙白阔腿裤', category: 'bottom', color: '米白色', material: '粘胶混纺', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 89900, asset: asset('bottom-06', require('../../../assets/demo-garments/ivory-wide-trousers.webp'), '293a0b2c296591ebb75a6766ddc94579cbd47c118519e2928c1f872189f34e2f', 31648) },
  { suffix: 'bottom-07', name: '巧克力色中长裙', category: 'bottom', color: '棕色', material: '缎面', season: '四季', occasion: '约会', formality: '半正式', priceMinor: 82900, asset: asset('bottom-07', require('../../../assets/demo-garments/chocolate-midi-skirt.webp'), '8a1df4f74259074f13ec5cfc03174b14870b22379a16e01b6b2ce6e7e70a07ae', 28018) },
  { suffix: 'bottom-08', name: '浅蓝直筒牛仔裤', category: 'bottom', color: '浅蓝色', material: '牛仔', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 69900, asset: asset('bottom-08', require('../../../assets/demo-garments/light-wash-jeans.webp'), 'c4a12cac8e22427c17f8ba1c47fbd6aea7c244369c7a8494cb47c7e4057e9aae', 63206) },
  { suffix: 'bottom-09', name: '藏蓝西装短裤', category: 'bottom', color: '藏蓝色', material: '羊毛混纺', season: '春夏', occasion: '通勤', formality: '半正式', priceMinor: 75900, asset: asset('bottom-09', require('../../../assets/demo-garments/navy-tailored-shorts.webp'), 'bc1f275948e1d002d6218e2aa5ef8f3de1733c5a649fc5c0c0523abd77119f4a', 32196) },
  { suffix: 'bottom-10', name: '锈红灯芯绒长裤', category: 'bottom', color: '锈红色', material: '灯芯绒', season: '秋冬', occasion: '日常', formality: '日常', priceMinor: 79900, asset: asset('bottom-10', require('../../../assets/demo-garments/rust-corduroy-pants.webp'), '88eb16336c46a52f7d8ff4746232a7023d4a152722964c68c690d46ce7206602', 51176) },
  { suffix: 'bottom-11', name: '灰棕格纹半裙', category: 'bottom', color: '灰棕色', material: '羊毛混纺', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 89900, asset: asset('bottom-11', require('../../../assets/demo-garments/plaid-midi-skirt.webp'), '5cc3bc7524f9fa854aa0e7588f9564b4c20fc6fda3014a919b8df2eb8df6c730', 130116) },
  { suffix: 'dress-04', name: '酒红裹身连衣裙', category: 'dress', color: '酒红色', material: '绉纱', season: '四季', occasion: '约会', formality: '正式', priceMinor: 139900, asset: asset('dress-04', require('../../../assets/demo-garments/burgundy-wrap-dress.webp'), 'a13b79c065b1c556625aa901b4b0091b32fb40fa328daf2d3562362afb573854', 42570) },
  { suffix: 'dress-05', name: '象牙白针织连衣裙', category: 'dress', color: '米白色', material: '针织', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 129900, asset: asset('dress-05', require('../../../assets/demo-garments/ivory-knit-dress.webp'), 'e4300132927650153080ce5e494e77a1e0189f313bc32220efbe8e0a59a9fcc4', 38164) },
  { suffix: 'dress-06', name: '藏蓝 A 字连衣裙', category: 'dress', color: '藏蓝色', material: '棉混纺', season: '四季', occasion: '商务', formality: '正式', priceMinor: 129900, asset: asset('dress-06', require('../../../assets/demo-garments/navy-a-line-dress.webp'), '1de8a6a313577d3ce26e51679cf5095cfb1ded7b2e0ea5d81a6ec9b6b1a10086', 29306) },
  { suffix: 'dress-07', name: '小花印花中长裙', category: 'dress', color: '米白蓝', material: '雪纺', season: '春夏', occasion: '休闲', formality: '日常', priceMinor: 109900, asset: asset('dress-07', require('../../../assets/demo-garments/floral-midi-dress.webp'), '24c62c4a8888b1081036eb81542be9d5f6083c5ff7e1d2b81baebbd36d083a34', 108682) },
  { suffix: 'dress-08', name: '锈橙系带衬衫裙', category: 'dress', color: '锈橙色', material: '亚麻混纺', season: '春秋', occasion: '旅行', formality: '半正式', priceMinor: 119900, asset: asset('dress-08', require('../../../assets/demo-garments/rust-shirt-dress.webp'), '46cd1e60d4561e8e6d0a4053c6249be54a9b8c8e71c2f0475a8681198c60cd55', 49478) },
  { suffix: 'outer-05', name: '橄榄绿工装夹克', category: 'outerwear', color: '橄榄绿', material: '棉', season: '春秋', occasion: '旅行', formality: '日常', priceMinor: 109900, asset: asset('outer-05', require('../../../assets/demo-garments/olive-field-jacket.webp'), '6ce97a6b0705660651d16f4d83f130088a4193da759e0b5f2e354d0d0abdd839', 66394) },
  { suffix: 'outer-06', name: '藏蓝羊毛大衣', category: 'outerwear', color: '藏蓝色', material: '羊毛', season: '秋冬', occasion: '通勤', formality: '正式', priceMinor: 229900, asset: asset('outer-06', require('../../../assets/demo-garments/navy-wool-coat.webp'), '509e3224057dd3f3a1b4796fc77f7c018f0c5f0555c0d2df18f4517ed55c7d83', 32910) },
  { suffix: 'outer-07', name: '酒红皮夹克', category: 'outerwear', color: '酒红色', material: '皮革', season: '春秋', occasion: '约会', formality: '半正式', priceMinor: 189900, asset: asset('outer-07', require('../../../assets/demo-garments/burgundy-leather-jacket.webp'), 'ff536f66a05e11e200b42bf99f541326603c42e13d5acf539b6219fc56d9ad2b', 88574) },
  { suffix: 'outer-08', name: '米色轻量羽绒服', category: 'outerwear', color: '米色', material: '羽绒', season: '秋冬', occasion: '休闲', formality: '日常', priceMinor: 159900, asset: asset('outer-08', require('../../../assets/demo-garments/beige-puffer.webp'), '6e37323be33849df001daadb7a961bff6803fb171cc356708d659673ef54f534', 79766) },
  { suffix: 'shoes-05', name: '棕色德比鞋', category: 'shoes', color: '棕色', material: '皮革', season: '四季', occasion: '商务', formality: '正式', priceMinor: 119900, asset: asset('shoes-05', require('../../../assets/demo-garments/brown-derby-shoes.webp'), 'bf152b8d63a93c861f1fba7d1fdd8ed196301e5f5fe003b78599eeaa9ae63ff5', 56756) },
  { suffix: 'shoes-06', name: '灰色跑鞋', category: 'shoes', color: '灰色', material: '织物', season: '四季', occasion: '运动', formality: '日常', priceMinor: 89900, asset: asset('shoes-06', require('../../../assets/demo-garments/grey-running-shoes.webp'), 'f5b63129d981a776a0cd92bfda88e22fd179f68952c2dbd2d343c01040ac8551', 98760) },
  { suffix: 'shoes-07', name: '黑色切尔西靴', category: 'shoes', color: '黑色', material: '皮革', season: '秋冬', occasion: '通勤', formality: '半正式', priceMinor: 139900, asset: asset('shoes-07', require('../../../assets/demo-garments/black-chelsea-boots.webp'), '7e5c90a6991f2d7ecec23f2af00942ce1b0351c89fc788a8cd56d40b6716b608', 49964) },
  { suffix: 'shoes-08', name: '奶油色后空跟鞋', category: 'shoes', color: '奶油色', material: '皮革', season: '春夏', occasion: '正式', formality: '正式', priceMinor: 129900, asset: asset('shoes-08', require('../../../assets/demo-garments/cream-slingback-heels.webp'), 'cc167a86c448f98c4dea5ecfe43ef03599f4edd28de4f5763cb067042437b3d9', 60930) },
  { suffix: 'accessory-03', name: '黑色斜挎包', category: 'accessory', color: '黑色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 139900, asset: asset('accessory-03', require('../../../assets/demo-garments/black-crossbody-bag.webp'), '40e8a4aea81e482d5a565668b1c3f78e6994e89ce6121479e92618284015fd0c', 93180) },
  { suffix: 'accessory-04', name: '藏蓝棒球帽', category: 'accessory', color: '藏蓝色', material: '棉', season: '四季', occasion: '休闲', formality: '日常', priceMinor: 29900, asset: asset('accessory-04', require('../../../assets/demo-garments/navy-cap.webp'), 'e2ddf00da81d7d014332b4bef666d183bfc1fbc6c9b4351edec3f52ea9fe8588', 51588) },
  { suffix: 'accessory-05', name: '棕色金扣腰带', category: 'accessory', color: '棕色', material: '皮革', season: '四季', occasion: '通勤', formality: '半正式', priceMinor: 49900, asset: asset('accessory-05', require('../../../assets/demo-garments/gold-buckle-belt.webp'), 'dc918570c8963cf80c971563f51f2e21e0d68feda0ed6ccff2f43bdc2b22f2c4', 63916) },
];
