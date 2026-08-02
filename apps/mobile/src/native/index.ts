/**
 * native：端侧能力适配（SegmentationEngine、文件、权限、COS 签名）。
 * 抠图默认引擎为腾讯云数据万象 GoodsMatting（tencentCiEngine.ts，cosSignature.ts 签名）；
 * 端侧 ONNX 路线已作废（2026-07-31 拍板改用现成分割 API）。
 */
export const NATIVE_LAYER = 'native' as const;
