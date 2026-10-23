import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

const now = () => new Date().toISOString();

export class WorkflowState extends EventEmitter {
  constructor({ runId = randomUUID(), requirement, workflowId }) {
    super();
    this.runId = runId;
    this.workflowId = workflowId;
    this.status = "queued";
    this.createdAt = now();
    this.startedAt = null;
    this.finishedAt = null;
    this.currentNode = null;
    this.blackboard = {
      request: {
        raw: requirement,
        receivedAt: now(),
      },
      requirements: null,
      design: null,
      implementation: null,
      verification: null,
    };
    this.messages = [];
    this.events = [];
    this.nodes = {};
    this.metrics = {
      attempts: 0,
      retries: 0,
      messageCount: 0,
    };
    this.error = null;
  }

  initializeNodes(nodeDefinitions) {
    this.nodes = Object.fromEntries(
      Object.entries(nodeDefinitions).map(([id, definition]) => [
        id,
        {
          id,
          label: definition.label ?? id,
          stage: definition.stage ?? id,
          status: "idle",
          startedAt: null,
          finishedAt: null,
          detail: null,
        },
      ]),
    );
  }

  start() {
    this.status = "running";
    this.startedAt = now();
    this.recordEvent("run.started", {
      message: "Mini SE workflow started.",
    });
  }

  complete() {
    this.status = "completed";
    this.finishedAt = now();
    this.currentNode = null;
    this.recordEvent("run.completed", {
      message: "Workflow completed successfully.",
    });
  }

  fail(error) {
    this.status = "failed";
    this.finishedAt = now();
    this.currentNode = null;
    this.error = error instanceof Error ? error.message : String(error);
    this.recordEvent("run.failed", {
      message: this.error,
    });
  }

  enterNode(nodeId) {
    this.currentNode = nodeId;
    const node = this.nodes[nodeId];
    if (!node) return;
    node.status = "running";
    node.startedAt = now();
    node.finishedAt = null;
    node.detail = null;
    this.recordEvent("node.started", {
      nodeId,
      stage: node.stage,
      label: node.label,
      message: `${node.label} started.`,
    });
  }

  finishNode(nodeId, detail = null) {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.status = "completed";
    node.finishedAt = now();
    node.detail = detail;
    this.recordEvent("node.completed", {
      nodeId,
      stage: node.stage,
      label: node.label,
      detail,
      message: `${node.label} completed.`,
    });
  }

  markNode(nodeId, status, detail = null) {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.status = status;
    node.finishedAt = ["failed", "skipped"].includes(status) ? now() : null;
    node.detail = detail;
    this.recordEvent(`node.${status}`, {
      nodeId,
      stage: node.stage,
      label: node.label,
      detail,
      message: detail ?? `${node.label} ${status}.`,
    });
  }

  recordMessage(message) {
    this.messages.push(message);
    this.metrics.messageCount = this.messages.length;
    this.emit("message", message);
  }

  recordEvent(type, payload = {}) {
    const event = {
      sequence: this.events.length + 1,
      type,
      timestamp: now(),
      ...payload,
    };
    this.events.push(event);
    this.emit("event", event);
    return event;
  }

  incrementAttempt() {
    this.metrics.attempts += 1;
    return this.metrics.attempts;
  }

  incrementRetry() {
    this.metrics.retries += 1;
    return this.metrics.retries;
  }

  snapshot() {
    return structuredClone({
      runId: this.runId,
      workflowId: this.workflowId,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      currentNode: this.currentNode,
      blackboard: this.blackboard,
      messages: this.messages,
      events: this.events,
      nodes: this.nodes,
      metrics: this.metrics,
      error: this.error,
    });
  }
}

