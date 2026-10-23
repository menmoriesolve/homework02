export class BaseAgent {
  constructor({ id, name, bus, state, llm = null }) {
    this.id = id;
    this.name = name;
    this.bus = bus;
    this.state = state;
    this.llm = llm;
  }

  async run(task) {
    this.bus.send({
      from: this.id,
      to: "orchestrator",
      kind: "agent.accepted",
      payload: { agentName: this.name },
    });
    const result = await this.handle(task);
    this.bus.send({
      from: this.id,
      to: "orchestrator",
      kind: "agent.completed",
      payload: {
        agentName: this.name,
        summary: result.summary ?? "Result ready.",
      },
    });
    return result;
  }

  async handle() {
    throw new Error("Agent must implement handle().");
  }
}
