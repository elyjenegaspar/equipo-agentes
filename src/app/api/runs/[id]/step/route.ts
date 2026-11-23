import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, tasks } from "@/db/schema";
import { runDevelopTask } from "@/agents/develop";
import { reviewDevelopTask, finalizeRun } from "@/agents/testing";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return Response.json({ error: "No existe" }, { status: 404 });
  if (run.status !== "en_curso") return Response.json({ done: true, status: run.status });

  const all = await db.select().from(tasks).where(eq(tasks.runId, id)).orderBy(asc(tasks.position));
  const dev = all.filter((t) => t.assignee === "develop");

  const toReview = dev.find((t) => t.status === "en_revision");
  const toDo = dev.find((t) => (t.status === "pendiente" || t.status === "fallida") && t.attempt < 3);

  try {
    if (toReview) {
      await reviewDevelopTask(toReview.id);
      return Response.json({ done: false, agent: "testing", taskId: toReview.id });
    }
    if (toDo) {
      await runDevelopTask(toDo.id);
      return Response.json({ done: false, agent: "develop", taskId: toDo.id });
    }
    const status = await finalizeRun(id);
    return Response.json({ done: true, status });
  } catch (e) {
    return Response.json(
      { done: false, error: String((e as Error).message) },
      { status: 500 }
    );
  }
}