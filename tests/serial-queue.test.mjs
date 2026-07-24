import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "../assets/js/serial-queue.js";

test("同一社員的寫入會依點擊順序執行", async () => {
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createSerialQueue();

  const first = queue.enqueue("m001", async () => {
    calls.push("參加：開始");
    await firstGate;
    calls.push("參加：完成");
  });
  const second = queue.enqueue("m001", async () => {
    calls.push("不克：完成");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["參加：開始"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["參加：開始", "參加：完成", "不克：完成"]);
});

test("前一筆失敗不會阻擋同一社員的下一筆操作", async () => {
  const calls = [];
  const queue = createSerialQueue();

  const failed = queue.enqueue("m001", async () => {
    calls.push("失敗");
    throw new Error("network");
  });
  const recovered = queue.enqueue("m001", async () => {
    calls.push("繼續");
  });

  await assert.rejects(failed);
  await recovered;
  assert.deepEqual(calls, ["失敗", "繼續"]);
});

test("不同社員不會互相鎖定", async () => {
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createSerialQueue();

  const first = queue.enqueue("m001", async () => {
    await firstGate;
    calls.push("m001");
  });
  const second = queue.enqueue("m002", async () => {
    calls.push("m002");
  });

  await second;
  assert.deepEqual(calls, ["m002"]);
  releaseFirst();
  await first;
  assert.deepEqual(calls, ["m002", "m001"]);
});
