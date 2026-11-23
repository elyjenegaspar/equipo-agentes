import { z } from "zod";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function askJson<T>(
  system: string,
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL,
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: 4000,
        messages: [
          { role: "system", content: `${system} Responde solo con JSON.` },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return schema.parse(JSON.parse(data.choices[0].message.content));
    }

    const text = await res.text();
    const err = new Error(`Groq ${res.status}: ${text.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    lastError = err;
    const retryable =
      [429, 500, 503].includes(res.status) ||
      (res.status === 400 && text.includes("json_validate_failed"));
    if (!retryable) throw err;

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      res.status === 429
        ? Math.min(Math.max(retryAfter || 5, 3), 15) * 1000
        : 1000 * 2 ** attempt;
    await sleep(waitMs);
  }
  throw lastError;
}