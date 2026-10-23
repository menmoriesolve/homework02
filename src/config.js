import { pathToFileURL } from "node:url";
import path from "node:path";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

export function loadLlmConfig(env = process.env) {
  const apiKey = env.LLM_API_KEY?.trim() ?? "";
  const baseUrl = (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const model = env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutMs = parseTimeout(env.LLM_TIMEOUT_MS);

  return Object.freeze({
    enabled: apiKey.length > 0,
    baseUrl,
    model,
    timeoutMs,
    getApiKey: () => apiKey,
  });
}

export function describeLlmConfig(config) {
  if (!config.enabled) {
    return "Local rules (no LLM_API_KEY configured)";
  }
  return `OpenAI-compatible API (${config.model} @ ${config.baseUrl})`;
}

function parseTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(parsed, 120_000);
}

const isEntryPoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
  const config = loadLlmConfig();
  console.log(`Agent mode: ${describeLlmConfig(config)}`);
  console.log(
    `API key: ${config.enabled ? "configured (value hidden)" : "not set"}`,
  );
  console.log("The API key is read from the environment and is never persisted.");
}

