import * as FileSystem from 'expo-file-system/legacy';

/** 把私有目录内相对路径转为可被 expo-image / Image 读取的 file URI。 */
export function originalUri(relPath: string): string {
  const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '';
  return `file://${base}/clothes/${relPath}`;
}

export function extFromUri(uri: string, mimeType?: string | null): string {
  if (mimeType) {
    const sub = mimeType.split('/')[1]?.toLowerCase();
    if (sub === 'jpeg' || sub === 'jpg') return 'jpg';
    if (sub === 'png' || sub === 'webp') return sub;
  }
  const clean = uri.split('?')[0] ?? uri;
  const m = /\.([a-zA-Z0-9]+)$/.exec(clean);
  if (m) {
    const e = m[1].toLowerCase();
    if (e === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp'].includes(e)) return e;
  }
  return 'jpg';
}
