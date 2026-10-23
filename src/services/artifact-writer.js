import { promises as fs } from "node:fs";
import path from "node:path";

export class ArtifactWriter {
  constructor({ outputRoot }) {
    this.outputRoot = path.resolve(outputRoot);
    this.runRoot = null;
  }

  setRunId(runId) {
    this.runRoot = this.#safeResolve(this.outputRoot, runId);
  }

  async writeArtifacts(state) {
    this.setRunId(state.runId);
    const { requirements, design, implementation, verification } =
      state.blackboard;
    const written = [];

    if (requirements) {
      await this.writeText("requirements.md", requirementsToMarkdown(requirements));
      written.push("requirements.md");
    }
    if (design) {
      await this.writeText("design.md", designToMarkdown(design));
      written.push("design.md");
    }
    if (implementation?.files) {
      for (const [relativePath, content] of Object.entries(
        implementation.files,
      )) {
        const target = path.posix.join("generated", relativePath);
        await this.writeText(target, content);
        written.push(target);
      }
    }
    if (verification) {
      await this.writeText("verification.md", verificationToMarkdown(verification));
      written.push("verification.md");
    }

    return {
      summary: `${written.length} artifact files written.`,
      files: written,
    };
  }

  async saveState(state) {
    this.setRunId(state.runId);
    await this.writeText("state.json", `${JSON.stringify(state.snapshot(), null, 2)}\n`);
  }

  async writeVerification(state) {
    this.setRunId(state.runId);
    if (!state.blackboard.verification) return;
    await this.writeText(
      "verification.md",
      verificationToMarkdown(state.blackboard.verification),
    );
  }

  async writeText(relativePath, content) {
    this.#assertRunRoot();
    const target = this.#safeResolve(this.runRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  resolveArtifact(relativePath) {
    this.#assertRunRoot();
    return this.#safeResolve(this.runRoot, relativePath);
  }

  #assertRunRoot() {
    if (!this.runRoot) {
      throw new Error("ArtifactWriter run ID has not been configured.");
    }
  }

  #safeResolve(root, relativePath) {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Unsafe artifact path: ${relativePath}`);
    }
    return target;
  }
}

function requirementsToMarkdown(requirements) {
  return `# 需求规格：${requirements.title}

## 目标

${requirements.summary}

## 用户故事

${requirements.userStories.map((story) => `- ${story}`).join("\n")}

## 功能需求

${requirements.features
  .map((feature) => `### ${feature.name}\n\n${feature.description}`)
  .join("\n\n")}

## 数据模型

- 实体：${requirements.entity.name}
- 资源集合：\`${requirements.entity.plural}\`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
${requirements.entity.fields
  .map(
    (field) =>
      `| \`${field.name}\` | ${field.type} | ${field.required ? "是" : "否"} | ${field.label ?? ""} |`,
  )
  .join("\n")}

## 验收标准

${requirements.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}

## 非功能需求

${requirements.nonFunctionalRequirements.map((item) => `- ${item}`).join("\n")}

## 假设

${requirements.assumptions.map((item) => `- ${item}`).join("\n")}
`;
}

function designToMarkdown(design) {
  return `# 技术设计

## 架构决策

${design.architecture}

技术栈：${design.stack.join(" / ")}

## 模块

| 模块 | 路径 | 职责 |
|---|---|---|
${design.modules
  .map((module) => `| ${module.name} | \`${module.path}\` | ${module.responsibility} |`)
  .join("\n")}

## API

| 方法 | 路径 | 用途 |
|---|---|---|
${design.api
  .map((endpoint) => `| ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.purpose} |`)
  .join("\n")}

## 设计决策

${design.decisions
  .map((item) => `- **${item.decision}**：${item.rationale}`)
  .join("\n")}

## 风险

${design.risks.map((risk) => `- ${risk}`).join("\n")}

## 实施任务

${design.implementationTasks.map((task) => `- ${task}`).join("\n")}
`;
}

function verificationToMarkdown(verification) {
  return `# 自动验证

- 结果：${verification.ok ? "通过" : "失败"}
- 摘要：${verification.summary}
- 退出码：${verification.exitCode ?? "N/A"}

## 测试输出

\`\`\`text
${verification.output || "(no output)"}
\`\`\`
`;
}

