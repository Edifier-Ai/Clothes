import * as FileSystem from 'expo-file-system/legacy';

/** 把私有目录内相对路径转为可被 expo-image / expo-file-system 读写的 file URI。 */
export function originalUri(relPath: string): string {
  // documentDirectory 本身已带 file:// scheme；此前再拼一次会得到
  // file://file://… 双 scheme——expo-image 容忍它，但 readAsStringAsync /
  // getInfoAsync / writeAsStringAsync 真机全部失败（MVP-008 画布/封面
  // 静默解码失败只画占位框的根因）。统一剥掉再补，保证恰好一个 scheme。
  const base = (FileSystem.documentDirectory ?? '').replace(/^file:\/\//, '').replace(/\/$/, '');
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
