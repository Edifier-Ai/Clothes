/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals';

import type { CutoutQueueItem } from '@/core/db/queue';
import {
  createCameraCapture,
  editorPostSaveTarget,
  editorRouteFor,
  nextSucceededGarmentId,
  type CameraPickerAdapter,
} from './importFlow';

function queueItem(jobId: string, garmentId: string, status = 'succeeded'): CutoutQueueItem {
  return {
    garmentName: garmentId,
    garmentCategory: 'top',
    originalRelPath: `originals/${garmentId}.png`,
    job: {
      id: jobId,
      garmentId,
      status,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      sourceStagedPath: null,
      originalRelPath: `originals/${garmentId}.png`,
      maskRelPath: `masks/${garmentId}.png`,
      previewRelPath: `previews/${garmentId}.png`,
      thumbnailRelPath: `thumbnails/${garmentId}.png`,
      width: 10,
      height: 20,
      sha256: 'hash',
      createdAt: 1,
      updatedAt: 2,
    },
  };
}

describe('导入与审核流程', () => {
  it('创建相机动作不会请求权限，用户调用后才请求', async () => {
    const requestPermission = jest.fn<CameraPickerAdapter['requestCameraPermissionsAsync']>()
      .mockResolvedValue({ granted: true });
    const launchCamera = jest.fn<CameraPickerAdapter['launchCameraAsync']>()
      .mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera/item.jpg', mimeType: 'image/jpeg' }] });
    const capture = createCameraCapture({
      requestCameraPermissionsAsync: requestPermission,
      launchCameraAsync: launchCamera,
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(launchCamera).not.toHaveBeenCalled();
    await expect(capture()).resolves.toEqual({
      kind: 'picked',
      picked: { uri: 'file:///camera/item.jpg', ext: 'jpg' },
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(launchCamera).toHaveBeenCalledTimes(1);
  });

  it('权限拒绝不会打开相机', async () => {
    const requestPermission = jest.fn<CameraPickerAdapter['requestCameraPermissionsAsync']>()
      .mockResolvedValue({ granted: false });
    const launchCamera = jest.fn<CameraPickerAdapter['launchCameraAsync']>();
    const capture = createCameraCapture({ requestCameraPermissionsAsync: requestPermission, launchCameraAsync: launchCamera });
    await expect(capture()).resolves.toEqual({ kind: 'denied' });
    expect(launchCamera).not.toHaveBeenCalled();
  });

  it('审核进入修边使用真实 garment id，并携带下一件 garment id', () => {
    const current = queueItem('job-opaque', 'garment-real-1');
    expect(editorRouteFor(current, 'garment-real-2')).toEqual({
      pathname: '/cutout-editor',
      params: { id: 'garment-real-1', returnTo: 'batch', nextId: 'garment-real-2' },
    });
  });

  it('审核下一件只选择成功任务；保存后优先跳下一张', () => {
    const items = [
      queueItem('job-1', 'garment-1'),
      queueItem('job-failed', 'garment-failed', 'failed'),
      queueItem('job-2', 'garment-2'),
    ];
    expect(nextSucceededGarmentId(items, 'job-1')).toBe('garment-2');
    expect(nextSucceededGarmentId(items, 'job-2', new Set(['job-1']))).toBeUndefined();
    expect(editorPostSaveTarget({ currentId: 'garment-1', nextId: 'garment-2', returnTo: 'batch' })).toEqual({
      kind: 'next',
      route: { pathname: '/cutout-editor', params: { id: 'garment-2', returnTo: 'batch' } },
    });
    expect(editorPostSaveTarget({ currentId: 'garment-2', returnTo: 'batch' })).toEqual({
      kind: 'batch',
      route: '/batch-import',
    });
  });
});
