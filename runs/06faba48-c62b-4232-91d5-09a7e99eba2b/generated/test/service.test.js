import test from "node:test";
import assert from "node:assert/strict";
import {
  createService,
  NotFoundError,
  ValidationError,
} from "../src/service.js";

const sample = {
  "title": "示例标题",
  "description": "示例描述",
  "status": "示例状态"
};

test("creates and lists 业务记录", () => {
  const service = createService();
  const created = service.create(sample);
  assert.ok(created.id);
  assert.equal(service.list().length, 1);
  assert.deepEqual(service.get(created.id), created);
});

test("updates an existing record", () => {
  const service = createService();
  const created = service.create(sample);
  const nextValue = typeof sample["title"] === "string"
    ? sample["title"] + "（已更新）"
    : sample["title"];
  const updated = service.update(created.id, { "title": nextValue });
  assert.equal(updated["title"], nextValue);
});

test("deletes an existing record", () => {
  const service = createService();
  const created = service.create(sample);
  assert.equal(service.remove(created.id).id, created.id);
  assert.equal(service.list().length, 0);
  assert.throws(() => service.get(created.id), NotFoundError);
});

test("rejects missing required fields", () => {
  const service = createService();
  const invalid = { ...sample };
  delete invalid["title"];
  assert.throws(() => service.create(invalid), ValidationError);
});
