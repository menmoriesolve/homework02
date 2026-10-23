import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export class CodeVerifier {
  constructor({ outputRoot, timeoutMs = 20_000 }) {
    this.outputRoot = path.resolve(outputRoot);
    this.timeoutMs = timeoutMs;
  }

  async verify(state) {
    const runRoot = path.join(this.outputRoot, state.runId);
    const projectRoot = path.join(runRoot, "generated");
    const implementation = state.blackboard.implementation;

    if (!implementation?.files) {
      return failed("No implementation artifact was published.");
    }

    const expected = [
      "package.json",
      "src/service.js",
      "src/server.js",
      "test/service.test.js",
    ];
    for (const relativePath of expected) {
      try {
        const stat = await fs.stat(path.join(projectRoot, relativePath));
        if (!stat.isFile() || stat.size === 0) {
          return failed(`Generated file is empty: ${relativePath}`);
        }
      } catch {
        return failed(`Generated file is missing: ${relativePath}`);
      }
    }

    const result = await runNodeTests(projectRoot, this.timeoutMs);
    return {
      ok: result.exitCode === 0,
      summary:
        result.exitCode === 0
          ? "Generated service passed its automated test suite."
          : `Automated tests failed with exit code ${result.exitCode}.`,
      exitCode: result.exitCode,
      signal: result.signal,
      output: result.output.slice(0, 20_000),
    };
  }
}

function failed(summary) {
  return {
    ok: false,
    summary,
    exitCode: null,
    signal: null,
    output: summary,
  };
}

function runNodeTests(cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test"], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(payload);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({
        exitCode: 124,
        signal: "TIMEOUT",
        output: `${output}\nVerification timed out after ${timeoutMs} ms.`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      finish({
        exitCode: 1,
        signal: null,
        output: `${output}\n${error.message}`,
      });
    });
    child.on("close", (code, signal) => {
      finish({
        exitCode: code ?? 1,
        signal,
        output,
      });
    });
  });
}

