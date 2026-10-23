import { WorkflowEngine } from "../core/workflow-engine.js";
import { RequirementsAgent } from "../agents/requirements-agent.js";
import { DesignAgent } from "../agents/design-agent.js";
import { CodingAgent } from "../agents/coding-agent.js";
import { ArtifactWriter } from "../services/artifact-writer.js";
import { CodeVerifier } from "../services/code-verifier.js";
import { LlmClient } from "../services/llm-client.js";
import { loadLlmConfig } from "../config.js";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createMiniSEWorkflow({
  outputRoot = path.resolve("runs"),
  runId = randomUUID(),
  maxAttempts = 2,
  llmConfig = loadLlmConfig(),
} = {}) {
  const writer = new ArtifactWriter({ outputRoot });
  const verifier = new CodeVerifier({ outputRoot });
  const llm = new LlmClient(llmConfig);
  const spec = buildWorkflowSpec({ maxAttempts });

  return new WorkflowEngine({
    spec,
    runId,
    writer,
    verifier,
    agentFactories: {
      requirements: ({ bus, state }) =>
        new RequirementsAgent({
          id: "requirements-agent",
          name: "需求分析 Agent",
          bus,
          state,
          llm,
        }),
      design: ({ bus, state }) =>
        new DesignAgent({
          id: "design-agent",
          name: "方案设计 Agent",
          bus,
          state,
          llm,
        }),
      coding: ({ bus, state }) =>
        new CodingAgent({
          id: "coding-agent",
          name: "编码实现 Agent",
          bus,
          state,
          llm,
        }),
    },
  });
}

function buildWorkflowSpec({ maxAttempts }) {
  const implementationNode = (state) =>
    state.blackboard.requirements.complexity >= 4 ? "code-extended" : "code-lean";

  return {
    id: "mini-se-v1",
    name: "Mini SE Workflow",
    start: "requirements",
    end: "complete",
    maxSteps: 30,
    nodes: {
      requirements: {
        label: "Requirement Analysis",
        stage: "requirements",
        kind: "agent",
        agent: "requirements",
        artifact: "requirements",
        next: "design",
        buildTask: ({ state }) => ({
          requirement: state.blackboard.request.raw,
        }),
      },
      design: {
        label: "Solution Design",
        stage: "design",
        kind: "agent",
        agent: "design",
        artifact: "design",
        next: "complexity-branch",
        buildTask: ({ state }) => ({
          requirement: state.blackboard.requirements,
        }),
      },
      "complexity-branch": {
        label: "Complexity Branch",
        stage: "design",
        kind: "condition",
        decide: ({ state }) => {
          const selected = implementationNode(state);
          const skipped = selected === "code-lean" ? "code-extended" : "code-lean";
          state.markNode(skipped, "skipped", "Not selected by complexity branch.");
          return selected;
        },
      },
      "code-lean": {
        label: "Lean Implementation",
        stage: "code",
        kind: "agent",
        agent: "coding",
        artifact: "implementation",
        next: "write-artifacts",
        buildTask: ({ state }) => codingTask(state, "lean"),
      },
      "code-extended": {
        label: "Extended Implementation",
        stage: "code",
        kind: "agent",
        agent: "coding",
        artifact: "implementation",
        next: "write-artifacts",
        buildTask: ({ state }) => codingTask(state, "extended"),
      },
      "write-artifacts": {
        label: "Write Artifacts",
        stage: "code",
        kind: "write",
        next: "verify",
      },
      verify: {
        label: "Automated Verification",
        stage: "verification",
        kind: "verify",
        next: "retry-branch",
      },
      "retry-branch": {
        label: "Retry Decision",
        stage: "verification",
        kind: "condition",
        decide: ({ state }) => {
          if (state.blackboard.verification.ok) return "complete";
          if (state.metrics.attempts < maxAttempts) {
            state.incrementRetry();
            return implementationNode(state);
          }
          return "failed";
        },
      },
      failed: {
        label: "Workflow Failed",
        stage: "verification",
        kind: "failure",
        message: "Workflow could not satisfy its quality gate.",
      },
    },
  };
}

function codingTask(state, implementationMode) {
  state.incrementAttempt();
  return {
    requirement: state.blackboard.requirements,
    design: state.blackboard.design,
    implementationMode,
    feedback:
      state.blackboard.verification?.ok === false
        ? state.blackboard.verification.summary
        : null,
  };
}

