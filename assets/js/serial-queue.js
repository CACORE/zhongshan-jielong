/**
 * 讓同一個 key 的非同步工作依加入順序執行；不同 key 可同時執行。
 * 回覆連點時可先更新畫面，再由此佇列確保寫入順序不會顛倒。
 */
export function createSerialQueue({
  onKeyBusy = () => {},
  onKeyIdle = () => {},
} = {}) {
  const queues = new Map();

  function enqueue(key, operation) {
    const normalizedKey = String(key);
    const previous = queues.get(normalizedKey) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);

    if (!queues.has(normalizedKey)) onKeyBusy(normalizedKey);
    queues.set(normalizedKey, next);

    const finish = () => {
      if (queues.get(normalizedKey) !== next) return;
      queues.delete(normalizedKey);
      onKeyIdle(normalizedKey);
    };
    void next.then(finish, finish);
    return next;
  }

  return {
    enqueue,
    has: (key) => queues.has(String(key)),
    get size() {
      return queues.size;
    },
  };
}
