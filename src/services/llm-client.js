export class LlmClient {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  get enabled() {
    return this.config.enabled;
  }

  async completeJson({ system, user }) {
    if (!this.enabled) {
      throw new Error("LLM API is not configured.");
    }

    const apiKey = this.config.getApiKey();
    const response = await this.fetchImpl(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );

    if (!response.ok) {
      const detail = redact(await response.text(), apiKey).slice(0, 500);
      throw new Error(
        `LLM API returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("LLM API returned an empty response.");
    }
    return parseJsonObject(content);
  }
}

function parseJsonObject(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Response must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Could not parse LLM JSON response: ${error.message}`);
  }
}

function redact(value, secret) {
  if (!secret) return value;
  return String(value).split(secret).join("[REDACTED]");
}

