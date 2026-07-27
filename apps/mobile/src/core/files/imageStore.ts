/**
 * 衣物图片文件存储（TECH_STACK §3：originals/masks/previews/thumbnails 分目录；
 * 原图只读，数据库只存路径/哈希/尺寸，不存 Base64）。
 *
 * 通过注入 FsAdapter/CryptoAdapter/DimReader 让设备（expo-file-system +
 * expo-crypto + RN Image）与 node 测试共用同一编排逻辑，并把“暂存→提交/中止”
 * 的孤儿文件保证变成可测的纯逻辑。
 */

export const ASSET_DIRS = ['originals', 'masks', 'previews', 'thumbnails'] as const;
export type AssetDir = (typeof ASSET_DIRS)[number];

export interface FsAdapter {
  ensureDirs(): void | Promise<void>;
  copyToStaged(sourceUri: string, stagedAbsPath: string): void | Promise<void>;
  moveStagedToFinal(stagedAbsPath: string, finalAbsPath: string): void | Promise<void>;
  deleteIfExists(absPath: string): void | Promise<void>;
  exists(absPath: string): boolean | Promise<boolean>;
  size(absPath: string): number | Promise<number>;
  /** 读取为 base64 仅供哈希计算，不入库。 */
  readBase64(absPath: string): string | Promise<string>;
}

export interface CryptoAdapter {
  sha256Base64(base64: string): string | Promise<string>;
}

export interface ImageDims {
  width: number;
  height: number;
}
export type DimReader = (uri: string) => Promise<ImageDims>;

export interface ImportImageDeps {
  fs: FsAdapter;
  crypto: CryptoAdapter;
  dims: DimReader;
  /** 私有根目录绝对路径（不含尾分隔符）。 */
  rootAbs: string;
  newId: () => string;
  /** 用于暂存/最终文件名，含扩展名，如 'a1b2.jpg'。 */
  ext: string;
}

export interface StagedImage {
  stagedAbsPath: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  /** 提交：暂存→最终路径；返回最终相对路径（如 originals/<id>.jpg）。 */
  commit: (finalId: string) => Promise<{ finalAbsPath: string; relPath: string }>;
  /** 中止：删除暂存文件（DB 失败或用户取消时调用，杜绝孤儿文件）。 */
  abort: () => Promise<void>;
}

function joinPath(root: string, ...parts: string[]): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const clean = (s: string) => s.replace(/^[\\/]+|[\\/]+$/g, '');
  return [root.replace(/[\\/]+$/g, ''), ...parts.map(clean)].join(sep);
}

function mimeTypeFromExt(ext: string): string {
  const e = ext.toLowerCase().replace('.', '');
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * 阶段一：校验源可读 → 复制到暂存 → 计算哈希/尺寸/大小。
 * 源不可读或写入失败时直接抛错，不产生任何持久文件。
 */
export async function stageImage(
  sourceUri: string,
  deps: ImportImageDeps,
): Promise<StagedImage> {
  const { fs, crypto, dims, rootAbs, newId, ext } = deps;
  await fs.ensureDirs();

  const stagedName = `stage-${newId()}.${ext.replace(/^\./, '')}`;
  const stagedAbsPath = joinPath(rootAbs, '_staging', stagedName);

  // 源不可读：copyToStaged 应抛错；此时无暂存文件残留。
  await fs.copyToStaged(sourceUri, stagedAbsPath);

  let aborted = false;
  const abort = async () => {
    if (aborted) return;
    aborted = true;
    await fs.deleteIfExists(stagedAbsPath);
  };

  try {
    const [base64, { width, height }, bytes] = await Promise.all([
      fs.readBase64(stagedAbsPath),
      dims(stagedAbsPath),
      fs.size(stagedAbsPath),
    ]);
    const sha256 = await crypto.sha256Base64(base64);

    const commit = async (finalId: string) => {
      const relPath = `originals/${finalId}.${ext.replace(/^\./, '')}`;
      const finalAbsPath = joinPath(rootAbs, relPath);
      await fs.moveStagedToFinal(stagedAbsPath, finalAbsPath);
      aborted = true; // 已晋升为最终文件，abort 不再删它
      return { finalAbsPath, relPath };
    };

    return {
      stagedAbsPath,
      sha256,
      width,
      height,
      bytes,
      mimeType: mimeTypeFromExt(ext),
      commit,
      abort,
    };
  } catch (err) {
    // 计算阶段失败：清理暂存，不留孤儿。
    await abort();
    throw err;
  }
}

/** 设备/测试通用：判断某相对路径对应的文件是否存在（缺失→可修复状态，不删记录）。 */
export async function originalExists(
  relPath: string,
  deps: Pick<ImportImageDeps, 'fs' | 'rootAbs'>,
): Promise<boolean> {
  return Boolean(await deps.fs.exists(joinPath(deps.rootAbs, relPath)));
}

export { joinPath as _joinPathForTest };
