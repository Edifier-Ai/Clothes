/**
 * skiaPngCodec：设备端 PNG 编解码（Skia，替代 pngjs+Buffer——后者在 Hermes 不存在，
 * 2026-08-01 真机抠图 3/3 失败 `Property 'Buffer' doesn't exist` 的修复）。
 *
 * Skia JSI 在 Node 测试环境不存在，这里用 jest.mock 提供假 Skia，验证接线：
 * 解码请求 RGBA_8888/Unpremul；编码 bytesPerRow=w*4、输出 ImageFormat.PNG；
 * 解码/编码失败（null 图像、null 像素、长度不符）必须抛错，不得静默产出坏图。
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockReadPixels = jest.fn();
const mockEncodeToBytes = jest.fn(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
const mockMakeImageFromEncoded = jest.fn();
const mockMakeImage = jest.fn();

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Data: { fromBytes: (bytes: Uint8Array) => ({ __data: bytes }) },
    Image: {
      MakeImageFromEncoded: (data: unknown) => mockMakeImageFromEncoded(data),
      MakeImage: (info: unknown, data: unknown, bytesPerRow: number) => mockMakeImage(info, data, bytesPerRow),
    },
  },
  ColorType: { RGBA_8888: 4 },
  AlphaType: { Unpremul: 2 },
  ImageFormat: { PNG: 4 },
}));

import { decodePng, decodeSkImage, encodeAlphaPng, encodePng } from './skiaPngCodec';

beforeEach(() => {
  mockReadPixels.mockClear();
  mockEncodeToBytes.mockClear();
  mockMakeImageFromEncoded.mockReset();
  mockMakeImage.mockReset();
});

describe('decodePng', () => {
  it('以 RGBA_8888 + Unpremul 解码并返回尺寸与像素', () => {
    const rgba = new Uint8Array([1, 2, 3, 255]);
    mockMakeImageFromEncoded.mockReturnValue({
      width: () => 1,
      height: () => 1,
      readPixels: mockReadPixels,
    });
    mockReadPixels.mockReturnValue(rgba);

    const out = decodePng(new Uint8Array([0x89, 0x50]));
    expect(mockMakeImageFromEncoded).toHaveBeenCalledTimes(1);
    expect(mockReadPixels).toHaveBeenCalledWith(0, 0, {
      width: 1,
      height: 1,
      colorType: 4,
      alphaType: 2,
    });
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    expect(Array.from(out.rgba)).toEqual([1, 2, 3, 255]);
  });

  it('编码数据无法识别时抛错', () => {
    mockMakeImageFromEncoded.mockReturnValue(null);
    expect(() => decodePng(new Uint8Array([0, 1]))).toThrow(/decode/i);
  });

  it('readPixels 失败时抛错', () => {
    mockMakeImageFromEncoded.mockReturnValue({ width: () => 2, height: () => 2, readPixels: mockReadPixels });
    mockReadPixels.mockReturnValue(null);
    expect(() => decodePng(new Uint8Array([0x89]))).toThrow(/readPixels/i);
  });
});

describe('encodePng', () => {
  it('bytesPerRow = w*4 且输出 ImageFormat.PNG', () => {
    mockMakeImage.mockReturnValue({ encodeToBytes: mockEncodeToBytes });
    const out = encodePng(new Uint8Array(2 * 3 * 4).fill(7), 2, 3);
    const call = mockMakeImage.mock.calls[0] as unknown as [{ width: number; height: number; colorType: number; alphaType: number }, unknown, number];
    expect(call[0]).toEqual({ width: 2, height: 3, colorType: 4, alphaType: 2 });
    expect(call[2]).toBe(2 * 4);
    expect(mockEncodeToBytes).toHaveBeenCalledWith(4);
    expect(out[0]).toBe(0x89);
  });

  it('rgba 长度与 w*h*4 不符时抛错，不调用 Skia', () => {
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow(/length/i);
    expect(mockMakeImage).not.toHaveBeenCalled();
  });

  it('MakeImage 失败时抛错', () => {
    mockMakeImage.mockReturnValue(null);
    expect(() => encodePng(new Uint8Array(4), 1, 1)).toThrow(/encode/i);
  });
});

describe('encodeAlphaPng', () => {
  it('灰度写入 RGB、alpha 恒 255', () => {
    let captured: Uint8Array | null = null;
    mockMakeImage.mockImplementation((...args: unknown[]) => {
      captured = (args[1] as { __data: Uint8Array }).__data;
      return { encodeToBytes: mockEncodeToBytes };
    });
    encodeAlphaPng(new Uint8Array([9, 0, 128, 255]), 2, 2);
    expect(captured).not.toBeNull();
    expect(Array.from(captured as unknown as Uint8Array)).toEqual([
      9, 9, 9, 255,
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
  });
});

describe('decodeSkImage（画布原图：JSI 解码，替代 file:// useImage）', () => {
  it('成功返回 SkImage，不解码像素', () => {
    const img = { width: () => 4, height: () => 4 };
    mockMakeImageFromEncoded.mockReturnValue(img);
    expect(decodeSkImage(new Uint8Array([0x89, 0x50]))).toBe(img);
    expect(mockMakeImageFromEncoded).toHaveBeenCalledTimes(1);
  });

  it('编码数据无法识别时抛错', () => {
    mockMakeImageFromEncoded.mockReturnValue(null);
    expect(() => decodeSkImage(new Uint8Array([0, 1]))).toThrow(/decode/i);
  });
});
