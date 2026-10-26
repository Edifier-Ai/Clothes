/**
 * 把异步任务排成一条队：后一个等前一个（成功或失败）结束再开始。
 * 抠图 drain 不能并发（claimNext 先查后改，两路同时跑会领到同一个任务），
 * 而批量导入页、衣物详情页、添加页都可能触发处理，所以统一串行。
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
