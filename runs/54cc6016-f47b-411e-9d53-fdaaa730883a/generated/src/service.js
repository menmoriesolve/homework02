import { randomUUID } from "node:crypto";

export const fields = [
  {
    "name": "title",
    "label": "书名",
    "type": "string",
    "required": true
  },
  {
    "name": "author",
    "label": "作者",
    "type": "string",
    "required": true
  },
  {
    "name": "isbn",
    "label": "ISBN",
    "type": "string",
    "required": false
  },
  {
    "name": "available",
    "label": "是否可借",
    "type": "boolean",
    "required": false
  }
];
const requiredFields = ["title","author"];
const editableFields = ["title","author","isbn","available"];

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

export function createService(seed = []) {
  const records = seed.map((record) => ({ ...record }));

  function list() {
    return records.map((record) => ({ ...record }));
  }

  function get(id) {
    const record = records.find((item) => item.id === id);
    if (!record) {
      throw new NotFoundError("图书不存在: " + id);
    }
    return { ...record };
  }

  function create(input = {}) {
    const record = normalize(input, false);
    record.id = randomUUID();
    records.unshift(record);
    return { ...record };
  }

  function update(id, input = {}) {
    const index = records.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundError("图书不存在: " + id);
    }
    const patch = normalize(input, true);
    records[index] = { ...records[index], ...patch, id };
    return { ...records[index] };
  }

  function remove(id) {
    const index = records.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundError("图书不存在: " + id);
    }
    const [removed] = records.splice(index, 1);
    return { ...removed };
  }

  return { list, get, create, update, remove };
}

function normalize(input, partial) {
  const errors = [];
  if (!partial) {
    for (const field of requiredFields) {
      if (input[field] === undefined || input[field] === null || input[field] === "") {
        errors.push({ field, message: "必填字段不能为空" });
      }
    }
  }

  const result = {};
  for (const definition of fields) {
    const value = input[definition.name];
    if (value === undefined) continue;
    const expected = definition.type;
    const actual = Array.isArray(value) ? "array" : typeof value;
    if (actual !== expected) {
      errors.push({
        field: definition.name,
        message: "期望类型 " + expected + "，实际为 " + actual,
      });
      continue;
    }
    result[definition.name] = value;
  }

  if (errors.length > 0) {
    throw new ValidationError("输入校验失败", errors);
  }
  return result;
}
