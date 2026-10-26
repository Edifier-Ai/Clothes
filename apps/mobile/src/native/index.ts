/**
 * native：端侧能力适配（SegmentationEngine、文件、权限、COS 签名）。
 * 抠图默认引擎为端侧 u2netp（localU2netEngine.ts，ONNX Runtime；2026-10-26 改回本地，免云费用）；
 * 腾讯云数据万象 GoodsMatting（tencentCiEngine.ts，cosSignature.ts 签名）为用户自配的可选云端模式。
 */
export const NATIVE_LAYER = 'native' as const;
