import { z } from "zod";
import { createRun } from "@/agents/orchestrator";

const bodySchema = z.object({ request: z.string().min(5).max(500) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  try {
    const runId = await createRun(parsed.data.request);
    return Response.json({ runId });
  } catch (e) {
    return Response.json({ error: String((e as Error).message) }, { status: 500 });
  }
}