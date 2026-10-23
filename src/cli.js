import path from "node:path";
import { createMiniSEWorkflow } from "./workflow/mini-se.workflow.js";
import { describeLlmConfig, loadLlmConfig } from "./config.js";

const defaultRequirement =
  "做一个图书管理服务，支持新增、查询、修改、删除图书。图书包含书名、作者、ISBN 和是否可借。";
const requirement = process.argv.slice(2).join(" ").trim() || defaultRequirement;
const llmConfig = loadLlmConfig();
const workflow = createMiniSEWorkflow({
  outputRoot: path.resolve("runs"),
  llmConfig,
});

workflow.state.on("event", (event) => {
  const node = event.nodeId ? `[${event.nodeId}] ` : "";
  const message = event.message ?? event.detail ?? "";
  console.log(`${formatTime(event.timestamp)} EVENT ${padEventType(event.type)} ${node}${message}`);
});

workflow.state.on("message", (message) => {
  console.log(
    `${formatTime(message.timestamp)} MSG   ${message.from} -> ${message.to} :: ${message.kind}`,
  );
});

console.log(`Mini SE Workflow`);
console.log(`Run ID: ${workflow.state.runId}`);
console.log(`Agent mode: ${describeLlmConfig(llmConfig)}`);
console.log(`Requirement: ${requirement}`);
console.log("".padEnd(78, "-"));
const result = await workflow.run(requirement);

if (result.status === "completed") {
  console.log("".padEnd(78, "-"));
  console.log("Workflow completed.");
  console.log(`Requirement: ${result.blackboard.requirements.title}`);
  console.log(`Design: ${result.blackboard.design.architecture}`);
  console.log(
    `Verification: ${result.blackboard.verification.summary}`,
  );
  console.log(`Messages: ${result.metrics.messageCount}`);
  console.log(`Attempts: ${result.metrics.attempts}`);
  console.log(`Retries: ${result.metrics.retries}`);
  console.log(`Run directory: ${path.resolve("runs", result.runId)}`);
  console.log(
    `Generated service: ${path.resolve("runs", result.runId, "generated")}`,
  );
} else {
  console.log("".padEnd(78, "-"));
  console.error(`Workflow failed: ${result.error}`);
  console.error(`Run directory: ${path.resolve("runs", result.runId)}`);
  process.exitCode = 1;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function padEventType(type) {
  return type.padEnd(17, " ");
}
