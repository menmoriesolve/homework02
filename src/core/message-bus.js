import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export class MessageBus extends EventEmitter {
  constructor({ state }) {
    super();
    this.state = state;
    this.on("message", (message) => this.state.recordMessage(message));
  }

  send({ from, to, kind, payload = {}, correlationId = this.state.runId }) {
    const message = {
      id: randomUUID(),
      correlationId,
      from,
      to,
      kind,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.emit("message", message);
    return message;
  }
}

