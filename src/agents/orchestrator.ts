import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, tasks, events } from "@/db/schema";
import { askJson } from "@/lib/llm";

const planSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(3),
        description: z.string().min(10),
        assignee: z.enum(["develop", "testing"]),
      })
    )
    .min(2)
    .max(6),
});

const SYSTEM = `Eres el Orquestador de un equipo de 2 agentes:
- "develop": escribe código (archivos HTML, CSS o TypeScript/React).
- "testing": comprueba el trabajo de develop y reporta lo que falla.
Divide la petición en entre 2 y 6 tareas, en el orden en que deben hacerse.
Las tareas de develop van primero y la última tarea siempre es de testing y verifica el resultado completo.
Cada descripción debe ser concreta y comprobable (qué archivo, qué elementos, qué debe cumplir).
Formato exacto: {"tasks":[{"title":"...","description":"...","assignee":"develop"|"testing"}]}`;

export async function createRun(request: string) {
  const [run] = await db.insert(runs).values({ request }).returning();

  await db.insert(events).values({
    runId: run.id,
    agent: "orquestador",
    message: `Petición recibida: ${request}`,
  });

  try {
    const plan = await askJson(SYSTEM, `Petición: ${request}`, planSchema);

    const created = await db
      .insert(tasks)
      .values(
        plan.tasks.map((t, i) => ({
          runId: run.id,
          title: t.title,
          description: t.description,
          assignee: t.assignee,
          position: i,
        }))
      )
      .returning();

    await db.insert(events).values(
      created.map((t) => ({
        runId: run.id,
        taskId: t.id,
        agent: "orquestador",
        message: `Tarea asignada a ${t.assignee}: ${t.title}`,
      }))
    );

    return run.id;
  } catch (e) {
    await db.update(runs).set({ status: "fallida" }).where(eq(runs.id, run.id));
    await db.insert(events).values({
      runId: run.id,
      agent: "orquestador",
      message: `No se pudo crear el plan: ${String((e as Error).message).slice(0, 200)}`,
    });
    throw e;
  }
}