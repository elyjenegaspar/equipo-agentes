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

    const err = new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    lastError = err;
    if (![429, 500, 503].includes(res.status)) throw err;
    await sleep(1000 * 2 ** attempt);
  }
  throw lastError;
}