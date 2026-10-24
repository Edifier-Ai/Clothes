/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockOpenAppDb = jest.fn<() => Promise<unknown>>();
const mockRestoreFromMirrorIfNeeded = jest.fn<() => Promise<boolean>>();
const mockWriteMirror = jest.fn<() => Promise<void>>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///private/',
}));

jest.mock('./expoDb', () => ({
  openAppDb: (...args: unknown[]) => mockOpenAppDb(...(args as [])),
}));

jest.mock('../garments/mirror', () => ({
  restoreFromMirrorIfNeeded: (...args: unknown[]) =>
    mockRestoreFromMirrorIfNeeded(...(args as [])),
  writeMirror: (...args: unknown[]) => mockWriteMirror(...(args as [])),
}));

// Mock 必须先注册，才能导入被测模块。
// eslint-disable-next-line import/first
import { createServiceRuntime } from './serviceRuntime';

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  createServiceRuntime().resetForTest();
  mockOpenAppDb.mockReset();
  mockRestoreFromMirrorIfNeeded.mockReset();
  mockWriteMirror.mockReset();
  mockWriteMirror.mockResolvedValue(undefined);
});

describe('createServiceRuntime', () => {
  it('并发首次 readyDb 只开库和回灌一次', async () => {
    const app = { db: { id: 'db-1' }, drizzleDb: { id: 'orm-1' } };
    let finishRestore!: () => void;
    mockOpenAppDb.mockResolvedValue(app);
    mockRestoreFromMirrorIfNeeded.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        finishRestore = () => resolve(true);
      }),
    );

    const first = createServiceRuntime().readyDb();
    const second = createServiceRuntime().readyDb();
    await tick();

    expect(mockOpenAppDb).toHaveBeenCalledTimes(1);
    expect(mockRestoreFromMirrorIfNeeded).toHaveBeenCalledTimes(1);

    finishRestore();
    await expect(Promise.all([first, second])).resolves.toEqual([app, app]);
  });

  it('persist 等待回灌完成后才写镜像', async () => {
    const app = { db: { id: 'db-1' }, drizzleDb: { id: 'orm-1' } };
    let finishRestore!: () => void;
    mockOpenAppDb.mockResolvedValue(app);
    mockRestoreFromMirrorIfNeeded.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        finishRestore = () => resolve(true);
      }),
    );

    const pending = createServiceRuntime().persist();
    await tick();
    expect(mockWriteMirror).not.toHaveBeenCalled();

    finishRestore();
    await pending;
    expect(mockWriteMirror).toHaveBeenCalledTimes(1);
    expect(mockWriteMirror).toHaveBeenCalledWith(
      'file:///private/clothes',
      app.db,
      app.drizzleDb,
      expect.any(Number),
    );
  });

  it('恢复期间 reset 不会让旧调用跳过恢复，新一代独立开库', async () => {
    const apps = [
      { db: { id: 'db-1' }, drizzleDb: { id: 'orm-1' } },
      { db: { id: 'db-2' }, drizzleDb: { id: 'orm-2' } },
    ];
    const finish: (() => void)[] = [];
    mockOpenAppDb
      .mockResolvedValueOnce(apps[0])
      .mockResolvedValueOnce(apps[1]);
    mockRestoreFromMirrorIfNeeded.mockImplementation(
      () => new Promise<boolean>((resolve) => finish.push(() => resolve(true))),
    );

    let firstDone = false;
    const runtime = createServiceRuntime();
    const first = runtime.readyDb().then((value) => {
      firstDone = true;
      return value;
    });
    await tick();

    runtime.resetForTest();
    const second = createServiceRuntime().readyDb();
    await tick();

    expect(mockOpenAppDb).toHaveBeenCalledTimes(2);
    expect(mockRestoreFromMirrorIfNeeded).toHaveBeenCalledTimes(2);

    finish[1]();
    await expect(second).resolves.toBe(apps[1]);
    expect(firstDone).toBe(false);

    finish[0]();
    await expect(first).resolves.toBe(apps[0]);
  });
});
