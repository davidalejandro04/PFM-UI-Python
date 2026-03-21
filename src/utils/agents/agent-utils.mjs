export function parseAgentJson(raw) {
  const trimmed = String(raw || "").trim();
  const stripped = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new SyntaxError("No JSON object found");
  return JSON.parse(stripped.slice(start, end + 1));
}

export function safeParseAgentJson(raw, fallback) {
  try {
    return parseAgentJson(raw);
  } catch {
    return fallback;
  }
}
