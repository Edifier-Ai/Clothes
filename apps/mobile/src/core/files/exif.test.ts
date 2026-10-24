/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockReadAsStringAsync = jest.fn<() => Promise<string>>();
const mockWriteAsStringAsync = jest.fn<() => Promise<void>>();
const mockDeleteAsync = jest.fn<() => Promise<void>>();
const mockDataDispose = jest.fn();
const mockImageDispose = jest.fn();
const mockEncodeToBytes = jest.fn<() => Uint8Array>();
const mockMakeImageFromEncoded = jest.fn();
const mockFromBytes = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...(args as [])),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...(args as [])),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...(args as [])),
}));

jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 4 },
  Skia: {
    Data: { fromBytes: (...args: unknown[]) => mockFromBytes(...args) },
    Image: {
      MakeImageFromEncoded: (...args: unknown[]) => mockMakeImageFromEncoded(...args),
    },
  },
}));

// Mock 必须先注册，才能导入被测模块。
// eslint-disable-next-line import/first
import {
  _readJpegExifOrientationForTest,
  normalizeExifOrientation,
} from './exif';

function jpegWithOrientation(orientation: number, littleEndian = true): Uint8Array {
  const payload = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    ...(littleEndian ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a]),
    ...(littleEndian ? [0x08, 0x00, 0x00, 0x00] : [0x00, 0x00, 0x00, 0x08]),
    ...(littleEndian ? [0x01, 0x00] : [0x00, 0x01]), // entry count
    ...(littleEndian
      ? [
          0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
          orientation, 0x00, 0x00, 0x00,
        ]
      : [
          0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
          0x00, orientation, 0x00, 0x00,
        ]),
    0x00, 0x00, 0x00, 0x00, // next IFD
  ];
  const length = payload.length + 2;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff,
    ...payload,
    0xff, 0xd9,
  ]);
}

function asBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadAsStringAsync.mockResolvedValue(asBase64(jpegWithOrientation(1)));
  mockWriteAsStringAsync.mockResolvedValue(undefined);
  mockDeleteAsync.mockResolvedValue(undefined);
  mockEncodeToBytes.mockReturnValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  mockFromBytes.mockReturnValue({ dispose: mockDataDispose });
  mockMakeImageFromEncoded.mockReturnValue({
    encodeToBytes: mockEncodeToBytes,
    dispose: mockImageDispose,
  });
});

describe('_readJpegExifOrientationForTest', () => {
  it('解析小端和大端 TIFF 的 1..8 方向值', () => {
    for (let orientation = 1; orientation <= 8; orientation++) {
      expect(_readJpegExifOrientationForTest(jpegWithOrientation(orientation))).toBe(orientation);
      expect(_readJpegExifOrientationForTest(jpegWithOrientation(orientation, false))).toBe(
        orientation,
      );
    }
  });

  it('损坏、非 JPEG 或非法方向均返回 null，不猜测', () => {
    expect(_readJpegExifOrientationForTest(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(_readJpegExifOrientationForTest(jpegWithOrientation(9))).toBeNull();
    expect(_readJpegExifOrientationForTest(jpegWithOrientation(6).subarray(0, 12))).toBeNull();
  });
});

describe('normalizeExifOrientation', () => {
  it('非 JPEG 和 Orientation=1 原样直通，不创建 PNG', async () => {
    await expect(normalizeExifOrientation('file:///picked/image.png', 'png')).resolves.toEqual({
      uri: 'file:///picked/image.png',
      ext: 'png',
      temporary: false,
      orientation: null,
    });
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();

    await expect(normalizeExifOrientation('file:///picked/image.jpg', 'jpg')).resolves.toEqual({
      uri: 'file:///picked/image.jpg',
      ext: 'jpg',
      temporary: false,
      orientation: 1,
    });
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockMakeImageFromEncoded).not.toHaveBeenCalled();
  });

  it('Orientation=2..8 才输出临时 PNG，并释放 Skia 资源', async () => {
    mockReadAsStringAsync.mockResolvedValue(asBase64(jpegWithOrientation(6)));

    const result = await normalizeExifOrientation('file:///picked/rotated.jpg', 'jpg');

    expect(result).toMatchObject({ ext: 'png', temporary: true, orientation: 6 });
    expect(result.uri).toMatch(/^file:\/\/\/cache\/exif-.*\.png$/);
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    expect(mockImageDispose).toHaveBeenCalledTimes(1);
    expect(mockDataDispose).toHaveBeenCalledTimes(1);
  });

  it('临时 PNG 写入失败时清理半文件并释放资源', async () => {
    mockReadAsStringAsync.mockResolvedValue(asBase64(jpegWithOrientation(8)));
    mockWriteAsStringAsync.mockRejectedValue(new Error('disk full'));

    await expect(
      normalizeExifOrientation('file:///picked/rotated.jpg', 'jpg'),
    ).rejects.toThrow('disk full');

    expect(mockDeleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/exif-.*\.png$/),
      { idempotent: true },
    );
    expect(mockImageDispose).toHaveBeenCalledTimes(1);
    expect(mockDataDispose).toHaveBeenCalledTimes(1);
  });
});
