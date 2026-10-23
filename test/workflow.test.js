import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMiniSEWorkflow } from "../src/workflow/mini-se.workflow.js";
import { RequirementsAgent } from "../src/agents/requirements-agent.js";
import { WorkflowEngine } from "../src/core/workflow-engine.js";
import {
  describeLlmConfig,
  loadLlmConfig,
} from "../src/config.js";
import { LlmClient } from "../src/services/llm-client.js";

test("requirements agent extracts a domain model and acceptance criteria", async () => {
  const state = {
    runId: "requirements-test",
  };
  const agent = new RequirementsAgent({
    id: "requirements-agent",
    name: "Requirements Agent",
    bus: { send() {} },
    state,
  });
  const result = await agent.run({
    requirement:
      "做一个图书管理服务，支持新增、查询、修改、删除图书，并包含搜索和分页。",
  });

  assert.equal(result.entity.plural, "books");
  assert.ok(result.features.some((feature) => feature.name === "创建记录"));
  assert.ok(result.features.some((feature) => feature.name === "搜索与筛选"));
  assert.ok(result.acceptanceCriteria.length >= 3);
  assert.ok(result.complexity >= 3);
});

test("Mini SE workflow runs requirements, design, code, verification, and persistence", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "minise-workflow-"));
  const workflow = createMiniSEWorkflow({
    outputRoot,
    runId: "standard-flow",
  });
  const result = await workflow.run(
    "做一个图书管理服务，支持新增、查询、修改、删除图书。图书包含书名、作者、ISBN 和是否可借。",
  );

  assert.equal(result.status, "completed");
  assert.equal(result.blackboard.requirements.entity.plural, "books");
  assert.match(result.blackboard.design.architecture, /REST service/);
  assert.ok(result.blackboard.implementation.files["src/server.js"]);
  assert.equal(result.blackboard.verification.ok, true);
  assert.equal(result.metrics.attempts, 1);
  assert.ok(result.messages.length >= 10);
  assert.ok(
    result.messages.some((message) => message.kind === "artifact.published"),
  );

  const generatedServer = await readFile(
    path.join(outputRoot, "standard-flow", "generated", "src", "server.js"),
    "utf8",
  );
  assert.match(generatedServer, /\/api\/books/);

  const persistedState = JSON.parse(
    await readFile(
      path.join(outputRoot, "standard-flow", "state.json"),
      "utf8",
    ),
  );
  assert.equal(persistedState.status, "completed");
  assert.ok(persistedState.events.length > 10);
  const verificationReport = await readFile(
    path.join(outputRoot, "standard-flow", "verification.md"),
    "utf8",
  );
  assert.match(verificationReport, /结果：通过/);
});

test("complex requirements select the extended implementation branch", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "minise-branch-"));
  const workflow = createMiniSEWorkflow({
    outputRoot,
    runId: "extended-flow",
  });
  const result = await workflow.run(
    "实现一个客服工单管理服务，支持创建、查询、更新和删除工单。需要权限校验、搜索、分页和数据库持久化设计。",
  );

  assert.equal(result.status, "completed");
  assert.ok(result.blackboard.requirements.complexity >= 4);
  assert.equal(result.blackboard.implementation.mode, "extended");
  assert.equal(result.nodes["code-lean"].status, "skipped");
  assert.equal(result.nodes["code-extended"].status, "completed");
});

test("workflow engine retries a failed quality gate and then completes", async () => {
  let verificationCalls = 0;
  const spec = {
    id: "retry-test",
    start: "code",
    end: "complete",
    maxSteps: 12,
    nodes: {
      code: {
        label: "Code",
        stage: "code",
        kind: "agent",
        agent: "coder",
        artifact: "implementation",
        next: "write",
        buildTask: ({ state }) => {
          state.incrementAttempt();
          return {};
        },
      },
      write: {
        label: "Write",
        stage: "code",
        kind: "write",
        next: "verify",
      },
      verify: {
        label: "Verify",
        stage: "verification",
        kind: "verify",
        next: "retry",
      },
      retry: {
        label: "Retry",
        stage: "verification",
        kind: "condition",
        decide: ({ state }) => {
          if (state.blackboard.verification.ok) return "complete";
          if (state.metrics.attempts < 2) {
            state.incrementRetry();
            return "code";
          }
          return "failed";
        },
      },
      failed: {
        label: "Failed",
        stage: "verification",
        kind: "failure",
      },
    },
  };
  const writer = {
    async writeArtifacts() {
      return { files: [], summary: "written" };
    },
    async writeVerification() {},
    async saveState() {},
  };
  const verifier = {
    async verify() {
      verificationCalls += 1;
      return verificationCalls === 1
        ? { ok: false, summary: "first attempt failed", output: "" }
        : { ok: true, summary: "second attempt passed", output: "" };
    },
  };
  const engine = new WorkflowEngine({
    spec,
    writer,
    verifier,
    runId: "retry-flow",
    agentFactories: {
      coder: () => ({
        async run() {
          return {
            summary: "code generated",
            files: { "src/index.js": "export {};" },
          };
        },
      }),
    },
  });
  const result = await engine.run("retry test");

  assert.equal(result.status, "completed");
  assert.equal(result.metrics.attempts, 2);
  assert.equal(result.metrics.retries, 1);
  assert.equal(verificationCalls, 2);
  assert.equal(result.blackboard.verification.ok, true);
});

test("LLM configuration reads the environment without serializing its key", () => {
  const secret = "test-secret-key";
  const config = loadLlmConfig({
    LLM_API_KEY: secret,
    LLM_BASE_URL: "https://example.test/v1/",
    LLM_MODEL: "example-model",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.baseUrl, "https://example.test/v1");
  assert.equal(config.model, "example-model");
  assert.equal(config.getApiKey(), secret);
  assert.equal(JSON.stringify(config).includes(secret), false);
  assert.equal(describeLlmConfig(config).includes(secret), false);
});

test("LLM client calls an OpenAI-compatible endpoint and parses JSON", async () => {
  let request = null;
  const client = new LlmClient(
    {
      enabled: true,
      baseUrl: "https://example.test/v1",
      model: "example-model",
      timeoutMs: 5_000,
      getApiKey: () => "test-secret-key",
    },
    {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: { content: '```json\n{"answer":"ok"}\n```' },
                },
              ],
            };
          },
        };
      },
    },
  );

  const result = await client.completeJson({
    system: "Return JSON.",
    user: "Test.",
  });

  assert.deepEqual(result, { answer: "ok" });
  assert.equal(request.url, "https://example.test/v1/chat/completions");
  assert.equal(
    request.options.headers.Authorization,
    "Bearer test-secret-key",
  );
  assert.equal(JSON.parse(request.options.body).model, "example-model");
});

test("LLM client redacts the API key from upstream error messages", async () => {
  const secret = "unit-test-placeholder";
  const client = new LlmClient(
    {
      enabled: true,
      baseUrl: "https://example.test/v1",
      model: "example-model",
      timeoutMs: 5_000,
      getApiKey: () => secret,
    },
    {
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async text() {
          return `Invalid credential: ${secret}`;
        },
      }),
    },
  );

  await assert.rejects(
    () =>
      client.completeJson({
        system: "Return JSON.",
        user: "Test.",
      }),
    (error) =>
      error.message.includes("HTTP 401") &&
      error.message.includes("[REDACTED]") &&
      !error.message.includes(secret),
  );
});

test("requirements agent can use an LLM result and validate its shape", async () => {
  const state = {
    runId: "llm-requirements-test",
    recordEvent() {},
  };
  const agent = new RequirementsAgent({
    id: "requirements-agent",
    name: "Requirements Agent",
    bus: { send() {} },
    state,
    llm: {
      enabled: true,
      async completeJson() {
        return {
          title: "预约管理服务",
          summary: "管理会议室预约。",
          actor: "员工",
          entity: {
            name: "预约",
            singular: "booking",
            plural: "bookings",
            fields: [
              {
                name: "room",
                label: "会议室",
                type: "string",
                required: true,
              },
            ],
          },
          features: [
            {
              name: "创建预约",
              description: "创建一条会议室预约。",
            },
          ],
          constraints: ["必须防止重复预约。"],
          complexity: 4,
        };
      },
    },
  });
  const result = await agent.run({
    requirement: "实现会议室预约服务",
  });

  assert.equal(result.source, "llm-api");
  assert.equal(result.title, "预约管理服务");
  assert.equal(result.entity.plural, "bookings");
  assert.equal(result.features[0].name, "创建预约");
  assert.equal(result.complexity, 4);
});

