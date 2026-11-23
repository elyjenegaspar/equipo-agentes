import { z } from "zod";
import { askJson } from "@/lib/llm";

export async function GET() {
  try {
    const out = await askJson(
      "Responde solo con JSON.",
      'Devuelve {"ok": true, "mensaje": "hola"}',
      z.object({ ok: z.boolean(), mensaje: z.string() })
    );
    return Response.json(out);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return Response.json(
      { ok: false, status: err.status ?? null, error: String(err.message ?? e).slice(0, 300) },
      { status: 500 }
    );
  }
}