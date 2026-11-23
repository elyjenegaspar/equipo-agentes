import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { runDevelopTask } from "@/agents/develop";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [next] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.runId, id),
        eq(tasks.assignee, "develop"),
        inArray(tasks.status, ["pendiente", "fallida"]),
        lt(tasks.attempt, 3)
      )
    )
    .orderBy(asc(tasks.position))
    .limit(1);

  if (!next) return Response.json({ done: true });

  try {
    await runDevelopTask(next.id);
    return Response.json({ done: false, taskId: next.id });
  } catch (e) {
    return Response.json(
      { done: false, taskId: next.id, error: String((e as Error).message) },
      { status: 500 }
    );
  }
}