import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, tasks, events } from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return Response.json({ error: "No existe" }, { status: 404 });

  const [runTasks, runEvents] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.runId, id)).orderBy(asc(tasks.position)),
    db.select().from(events).where(eq(events.runId, id)).orderBy(asc(events.createdAt)),
  ]);

  return Response.json({ run, tasks: runTasks, events: runEvents });
}