import { MessageBus } from "./message-bus.js";
import { WorkflowState } from "./workflow-state.js";

export class WorkflowEngine {
  constructor({ spec, agentFactories, verifier, writer, runId }) {
    this.spec = spec;
    this.verifier = verifier;
    this.writer = writer;
    this.state = new WorkflowState({
      runId,
      requirement: "",
      workflowId: spec.id,
    });
    this.state.initializeNodes(spec.nodes);
    this.bus = new MessageBus({ state: this.state });
    this.agents = Object.fromEntries(
      Object.entries(agentFactories).map(([id, factory]) => [
        id,
        factory({ bus: this.bus, state: this.state }),
      ]),
    );
  }

  async run(requirement) {
    this.state.blackboard.request.raw = requirement;
    this.state.start();
    let current = this.spec.start;
    let guard = 0;

    try {
      while (current && current !== this.spec.end) {
        if (++guard > this.spec.maxSteps) {
          throw new Error("Workflow exceeded its maximum step count.");
        }

        const node = this.spec.nodes[current];
        if (!node) {
          throw new Error(`Unknown workflow node: ${current}`);
        }

        this.state.enterNode(current);
        const context = {
          state: this.state,
          bus: this.bus,
          attempts: this.state.metrics.attempts,
        };

        if (node.kind === "agent") {
          const agent = this.agents[node.agent];
          if (!agent) {
            throw new Error(`Agent is not registered: ${node.agent}`);
          }
          const task = node.buildTask
            ? node.buildTask(context)
            : { requirement };
          this.bus.send({
            from: "orchestrator",
            to: node.agent,
            kind: "task.dispatch",
            payload: {
              nodeId: current,
              ...this.#summarizeTask(task),
            },
          });
          const result = await agent.run(task);
          this.state.blackboard[node.artifact] = result;
          this.bus.send({
            from: node.agent,
            to: "blackboard",
            kind: "artifact.published",
            payload: {
              artifact: node.artifact,
              nodeId: current,
              summary: this.#summarizeArtifact(node.artifact, result),
            },
          });
          this.state.finishNode(current, this.#summarizeNodeResult(result));
          current = node.next;
        } else if (node.kind === "condition") {
          const next = node.decide(context);
          this.state.finishNode(current, `Selected: ${next}`);
          this.state.recordEvent("branch.selected", {
            nodeId: current,
            message: `Branch selected: ${next}`,
          });
          current = next;
        } else if (node.kind === "write") {
          const result = await this.writer.writeArtifacts(this.state);
          this.state.finishNode(current, result.summary);
          current = node.next;
        } else if (node.kind === "verify") {
          const result = await this.verifier.verify(this.state);
          this.state.blackboard.verification = result;
          await this.writer.writeVerification(this.state);
          this.state.finishNode(current, result.summary);
          current = typeof node.next === "function" ? node.next(context) : node.next;
        } else if (node.kind === "failure") {
          throw new Error(
            this.state.blackboard.verification?.summary ??
              node.message ??
              "Workflow failed.",
          );
        } else {
          throw new Error(`Unsupported workflow node kind: ${node.kind}`);
        }
      }

      this.state.complete();
    } catch (error) {
      this.state.fail(error);
    } finally {
      await this.writer.saveState(this.state);
    }

    return this.state.snapshot();
  }

  snapshot() {
    return this.state.snapshot();
  }

  #summarizeTask(task) {
    return {
      keys: Object.keys(task),
      requirement:
        typeof task.requirement === "string"
          ? task.requirement.slice(0, 180)
          : undefined,
      feedback: task.feedback ?? undefined,
    };
  }

  #summarizeArtifact(name, artifact) {
    if (name === "requirements") {
      return `${artifact.title} | ${artifact.features.length} features | complexity ${artifact.complexity}/5`;
    }
    if (name === "design") {
      return `${artifact.architecture} | ${artifact.modules.length} modules`;
    }
    if (name === "implementation") {
      return `${Object.keys(artifact.files).length} files generated`;
    }
    return "Artifact published.";
  }

  #summarizeNodeResult(result) {
    if (result?.summary) return result.summary;
    if (result?.title) return result.title;
    return "Completed.";
  }
}

