import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AddGarmentScreen from '../src/app/add-garment';
import type { StagedImage } from '../src/core/files/imageStore';

type Prepared =
  | { kind: 'ready'; staged: StagedImage }
  | { kind: 'duplicate'; staged: StagedImage; existing: unknown };

const mockBack = jest.fn((..._args: unknown[]) => {});
const mockPrepareAdd = jest.fn(
  async (..._args: unknown[]): Promise<Prepared> => ({ kind: 'ready', staged: staged('default') }),
);
const mockCommitAdd = jest.fn(async (..._args: unknown[]): Promise<unknown> => ({}));
const mockAddGarment = jest.fn(
  async (..._args: unknown[]): Promise<Prepared> => ({ kind: 'ready', staged: staged('default-add') }),
);
const mockRequestPermission = jest.fn(
  async (..._args: unknown[]): Promise<{ granted: boolean }> => ({ granted: true }),
);
const mockLaunchPicker = jest.fn(
  async (..._args: unknown[]): Promise<ReturnType<typeof picked>> => picked('file:///default.jpg'),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: (...args: unknown[]) => mockBack(...args) }),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchPicker(...args),
}));

const mockCutoutInBackground = jest.fn(async (..._args: unknown[]): Promise<string | null> => null);

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({ db: {}, drizzleDb: {} })),
}));

jest.mock('@/core/cutout/cutoutService', () => ({
  cutoutGarmentInBackground: (...args: unknown[]) => mockCutoutInBackground(...args),
}));

jest.mock('@/core/garments/service', () => ({
  prepareAdd: (...args: unknown[]) => mockPrepareAdd(...args),
  commitAdd: (...args: unknown[]) => mockCommitAdd(...args),
  addGarment: (...args: unknown[]) => mockAddGarment(...args),
}));

function staged(id: string): StagedImage {
  return {
    stagedAbsPath: `staging/${id}.jpg`,
    sha256: `sha-${id}`,
    width: 100,
    height: 120,
    bytes: 123,
    mimeType: 'image/jpeg',
    commit: jest.fn(async () => ({ finalAbsPath: `originals/${id}.jpg`, relPath: `originals/${id}.jpg` })),
    abort: jest.fn(async () => {}),
  };
}

function picked(uri: string) {
  return { canceled: false, assets: [{ uri, mimeType: 'image/jpeg' }] };
}

async function chooseFirstImage() {
  fireEvent.press(screen.getByRole('button', { name: '从相册选择一张衣物照片' }));
  await waitFor(() => expect(mockPrepareAdd).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermission.mockResolvedValue({ granted: true });
  mockCommitAdd.mockResolvedValue({ garment: { id: 'new-g' } });
  mockCutoutInBackground.mockResolvedValue(null);
});

it('正常保存直接提交第一次 prepareAdd 的 staged，不再次 prepare', async () => {
  const first = staged('first');
  mockLaunchPicker.mockResolvedValueOnce(picked('file:///first.jpg'));
  mockPrepareAdd.mockResolvedValueOnce({ kind: 'ready', staged: first });
  mockAddGarment.mockResolvedValue({ kind: 'ready', staged: staged('second') });

  render(<AddGarmentScreen />);
  await chooseFirstImage();
  fireEvent.press(screen.getByRole('button', { name: '保存衣物' }));

  await waitFor(() => expect(mockCommitAdd).toHaveBeenCalledWith(first, expect.anything(), 'jpg'));
  expect(mockPrepareAdd).toHaveBeenCalledTimes(1);
  expect(mockAddGarment).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('保存后在后台为新衣物入队抠图；抠图失败不影响保存', async () => {
  const first = staged('first');
  mockLaunchPicker.mockResolvedValueOnce(picked('file:///first.jpg'));
  mockPrepareAdd.mockResolvedValueOnce({ kind: 'ready', staged: first });
  mockCutoutInBackground.mockRejectedValueOnce(new Error('model missing'));

  render(<AddGarmentScreen />);
  await chooseFirstImage();
  fireEvent.press(screen.getByRole('button', { name: '保存衣物' }));

  await waitFor(() => expect(mockCutoutInBackground).toHaveBeenCalledWith(expect.anything(), 'new-g'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('重选成功后 abort 上一份未提交 staged', async () => {
  const first = staged('first');
  const second = staged('second');
  mockLaunchPicker
    .mockResolvedValueOnce(picked('file:///first.jpg'))
    .mockResolvedValueOnce(picked('file:///second.jpg'));
  mockPrepareAdd
    .mockResolvedValueOnce({ kind: 'ready', staged: first })
    .mockResolvedValueOnce({ kind: 'ready', staged: second });

  render(<AddGarmentScreen />);
  await chooseFirstImage();
  fireEvent.press(screen.getAllByRole('button')[0]);

  await waitFor(() => expect(mockPrepareAdd).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(first.abort).toHaveBeenCalledTimes(1));
  expect(second.abort).not.toHaveBeenCalled();
});

it('页面卸载时 abort 当前未提交 staged', async () => {
  const first = staged('first');
  mockLaunchPicker.mockResolvedValueOnce(picked('file:///first.jpg'));
  mockPrepareAdd.mockResolvedValueOnce({ kind: 'ready', staged: first });

  const view = render(<AddGarmentScreen />);
  await chooseFirstImage();
  view.unmount();

  await waitFor(() => expect(first.abort).toHaveBeenCalledTimes(1));
});
