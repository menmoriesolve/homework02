import { BaseAgent } from "./base-agent.js";

export class CodingAgent extends BaseAgent {
  async handle({ requirement, design, implementationMode, feedback }) {
    if (!requirement || !design) {
      throw new Error("Coding agent requires requirement and design artifacts.");
    }

    const entity = requirement.entity;
    const files = buildProjectFiles({ requirement, design, entity });
    validateGeneratedFiles(files);

    return {
      summary: `${implementationMode === "extended" ? "扩展" : "精简"}模式生成 ${Object.keys(files).length} 个文件。`,
      mode: implementationMode,
      entity: entity.name,
      collection: entity.plural,
      files,
      implementationNotes: [
        `CRUD 资源路径为 /api/${entity.plural}。`,
        "服务启动时创建空集合，可直接通过 API 写入数据。",
        "所有业务错误均返回结构化 JSON。",
      ],
      addressedFeedback: feedback ?? null,
    };
  }
}

function buildProjectFiles({ requirement, design, entity }) {
  const requiredFields = entity.fields
    .filter((field) => field.required)
    .map((field) => field.name);
  const editableFields = entity.fields.map((field) => field.name);
  const fieldDefinitions = JSON.stringify(entity.fields, null, 2);
  const collection = entity.plural;
  const packageName = `minise-${collection}-service`;

  return {
    "package.json": `${JSON.stringify(
      {
        name: packageName,
        version: "1.0.0",
        private: true,
        type: "module",
        description: requirement.title,
        scripts: {
          start: "node src/server.js",
          test: "node --test",
        },
        engines: { node: ">=20" },
      },
      null,
      2,
    )}\n`,
    "src/service.js": buildServiceSource({
      collection,
      requiredFields,
      editableFields,
      fieldDefinitions,
      entityName: entity.name,
    }),
    "src/server.js": buildServerSource({ collection, entityName: entity.name }),
    "test/service.test.js": buildTestSource({
      entity,
      requiredFields,
      editableFields,
    }),
    "README.md": buildGeneratedReadme({ design, requirement, entity }),
  };
}

function buildServiceSource({
  collection,
  requiredFields,
  editableFields,
  fieldDefinitions,
  entityName,
}) {
  return `import { randomUUID } from "node:crypto";

export const fields = ${fieldDefinitions};
const requiredFields = ${JSON.stringify(requiredFields)};
const editableFields = ${JSON.stringify(editableFields)};

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
      throw new NotFoundError("${entityName}不存在: " + id);
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
      throw new NotFoundError("${entityName}不存在: " + id);
    }
    const patch = normalize(input, true);
    records[index] = { ...records[index], ...patch, id };
    return { ...records[index] };
  }

  function remove(id) {
    const index = records.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundError("${entityName}不存在: " + id);
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
`;
}

function buildServerSource({ collection, entityName }) {
  return `import { createServer } from "node:http";
import {
  createService,
  NotFoundError,
  ValidationError,
} from "./service.js";

const port = Number(process.env.PORT ?? 3100);
const service = createService();
const collectionPath = "/api/${collection}";

const server = createServer(async (request, response) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      return send(response, 200, { status: "ok", entity: "${entityName}" });
    }
    if (request.method === "GET" && url.pathname === collectionPath) {
      return send(response, 200, { data: service.list() });
    }
    if (request.method === "POST" && url.pathname === collectionPath) {
      const body = await readJson(request);
      return send(response, 201, { data: service.create(body) });
    }

    const match = url.pathname.match(new RegExp("^" + collectionPath + "/([^/]+)$"));
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (request.method === "GET") {
        return send(response, 200, { data: service.get(id) });
      }
      if (request.method === "PUT") {
        const body = await readJson(request);
        return send(response, 200, { data: service.update(id, body) });
      }
      if (request.method === "DELETE") {
        return send(response, 200, { data: service.remove(id) });
      }
    }
    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ValidationError) {
      return send(response, 400, {
        error: error.message,
        details: error.details,
      });
    }
    if (error instanceof NotFoundError) {
      return send(response, 404, { error: error.message });
    }
    console.error(error);
    return send(response, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log("${entityName} API listening on http://localhost:" + port);
});

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("请求体必须是合法 JSON");
  }
}
`;
}

function buildTestSource({ entity, requiredFields, editableFields }) {
  const sampleValues = {};
  for (const field of entity.fields) {
    sampleValues[field.name] =
      field.type === "string"
        ? `示例${field.label ?? field.name}`
        : field.type === "number"
          ? 10
          : field.type === "boolean"
            ? true
            : null;
  }
  const patchField = editableFields[0] ?? "title";
  const missingField = requiredFields[0] ?? editableFields[0] ?? "title";

  return `import test from "node:test";
import assert from "node:assert/strict";
import {
  createService,
  NotFoundError,
  ValidationError,
} from "../src/service.js";

const sample = ${JSON.stringify(sampleValues, null, 2)};

test("creates and lists ${entity.name}", () => {
  const service = createService();
  const created = service.create(sample);
  assert.ok(created.id);
  assert.equal(service.list().length, 1);
  assert.deepEqual(service.get(created.id), created);
});

test("updates an existing record", () => {
  const service = createService();
  const created = service.create(sample);
  const nextValue = typeof sample["${patchField}"] === "string"
    ? sample["${patchField}"] + "（已更新）"
    : sample["${patchField}"];
  const updated = service.update(created.id, { "${patchField}": nextValue });
  assert.equal(updated["${patchField}"], nextValue);
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
  delete invalid["${missingField}"];
  assert.throws(() => service.create(invalid), ValidationError);
});
`;
}

function buildGeneratedReadme({ design, requirement, entity }) {
  return `# ${requirement.title}

该服务由 MiniSE Workflow 自动生成，实现 ${entity.name} 的 CRUD 闭环。

## 启动

\`\`\`bash
npm start
\`\`\`

默认端口为 \`3100\`，可通过 \`PORT\` 环境变量修改。

## 测试

\`\`\`bash
npm test
\`\`\`

## API

${design.api.map((endpoint) => `- \`${endpoint.method} ${endpoint.path}\`: ${endpoint.purpose}`).join("\n")}

## 架构

${design.architecture}
`;
}

function validateGeneratedFiles(files) {
  const required = [
    "package.json",
    "src/service.js",
    "src/server.js",
    "test/service.test.js",
    "README.md",
  ];
  for (const file of required) {
    if (!files[file]?.trim()) {
      throw new Error(`Generated project is missing ${file}.`);
    }
  }
  if (files["src/server.js"].includes("__PLACEHOLDER__")) {
    throw new Error("Generated project contains unresolved placeholders.");
  }
}

