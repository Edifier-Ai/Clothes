import type { CutoutQueueItem } from '@/core/db/queue';
import { extFromUri } from '@/core/files/uri';

export interface CameraPickerAdapter {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchCameraAsync: (options: {
    mediaTypes: 'images'[];
    quality: number;
  }) => Promise<{
    canceled: boolean;
    assets?: { uri: string; mimeType?: string | null }[] | null;
  }>;
}

export type CameraCaptureResult =
  | { kind: 'picked'; picked: { uri: string; ext: string } }
  | { kind: 'denied' }
  | { kind: 'cancelled' };

/**
 * 创建相机动作本身不会读取权限；只有用户点击后调用返回函数才请求。
 * 这样首屏加载不会弹系统权限框，拒绝权限也不影响相册导入。
 */
export function createCameraCapture(adapter: CameraPickerAdapter): () => Promise<CameraCaptureResult> {
  return async () => {
    const permission = await adapter.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'denied' };
    const result = await adapter.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return { kind: 'cancelled' };
    return {
      kind: 'picked',
      picked: { uri: asset.uri, ext: extFromUri(asset.uri, asset.mimeType ?? undefined) },
    };
  };
}

export const QUEUE_STATUS_LABEL: Record<CutoutQueueItem['job']['status'], string> = {
  pending: '待处理',
  running: '处理中',
  succeeded: '待审核',
  failed: '处理失败',
  cancelled: '已跳过',
};

export function fileUri(root: string, relativeOrAbsolute: string | null | undefined): string | null {
  if (!relativeOrAbsolute) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
  const absolute = relativeOrAbsolute.startsWith('/') ? relativeOrAbsolute : `${root}/${relativeOrAbsolute}`;
  return `file://${absolute}`;
}

/** 每个审核/修边入口都使用真实 garmentId，绝不能把 queue job id 当成衣物 id。 */
export function editorRouteFor(item: CutoutQueueItem, nextGarmentId?: string) {
  return {
    pathname: '/cutout-editor' as const,
    params: {
      id: item.job.garmentId,
      returnTo: 'batch',
      ...(nextGarmentId ? { nextId: nextGarmentId } : {}),
    },
  };
}

export function nextSucceededGarmentId(
  items: CutoutQueueItem[],
  currentJobId: string,
  excludedJobIds: ReadonlySet<string> = new Set(),
): string | undefined {
  const current = items.findIndex((item) => item.job.id === currentJobId);
  if (current < 0) return undefined;
  for (let offset = 1; offset < items.length; offset++) {
    const candidate = items[(current + offset) % items.length];
    if (candidate.job.status === 'succeeded' && !excludedJobIds.has(candidate.job.id)) return candidate.job.garmentId;
  }
  return undefined;
}

export type EditorPostSaveTarget =
  | { kind: 'next'; route: { pathname: '/cutout-editor'; params: { id: string; returnTo: string } } }
  | { kind: 'batch'; route: '/batch-import' }
  | { kind: 'back' };

/** 保存成功后才计算导航；下一张优先，随后回批量审核，普通入口则返回上一页。 */
export function editorPostSaveTarget(input: {
  currentId: string;
  nextId?: string;
  returnTo?: string;
}): EditorPostSaveTarget {
  if (input.nextId && input.nextId !== input.currentId) {
    return {
      kind: 'next',
      route: {
        pathname: '/cutout-editor',
        params: { id: input.nextId, returnTo: input.returnTo ?? 'batch' },
      },
    };
  }
  if (input.returnTo === 'batch') return { kind: 'batch', route: '/batch-import' };
  return { kind: 'back' };
}
