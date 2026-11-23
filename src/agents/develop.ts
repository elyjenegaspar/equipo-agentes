import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, events, artifacts } from "@/db/schema";
import { askJson } from "@/lib/llm";

const outSchema = z.object({
  summary: z.string().min(3),
  files: z
    .array(
      z.object({
        path: z
          .string()
          .regex(/^src\/(app|components)\/[A-Za-z0-9_\-\/\[\]]+\.tsx$/)
          .refine((p) => !p.includes("..")),
        content: z.string().min(20).max(8000),
      })
    )
    .min(1)
    .max(4),
});

const SYSTEM = `Eres Develop, un agente que programa en un proyecto Next.js (App Router, TypeScript, Tailwind).
Recibes una tarea y los archivos actuales del proyecto.
Reglas:
- Devuelve siempre archivos COMPLETOS (nunca fragmentos). Si modificas un archivo existente, conserva lo que ya funcionaba.
- Solo puedes escribir rutas src/app/**/page.tsx o src/components/*.tsx.
- Si usas estado o eventos (useState, onSubmit, onClick), el archivo debe empezar con "use client";.
- Enlaces con next/link. Estilos con clases de Tailwind. Textos visibles en español.
- Si recibes fallos de una revisión anterior, corrígelos todos.
- El layout (src/app/layout.tsx) ya incluye NavBar en todas las páginas: no importes NavBar dentro de las páginas.
Formato exacto: {"summary":"...","files":[{"path":"...","content":"..."}]}`;

export async function latestFiles(runId: string) {
  const rows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.runId, runId))
    .orderBy(desc(artifacts.version));
  const map = new Map<string, { content: string; version: number }>();
  for (const r of rows) {
    if (!map.has(r.path)) map.set(r.path, { content: r.content, version: r.version });
  }
  return map;
}

async function log(runId: string, taskId: string, message: string) {
  await db.insert(events).values({ runId, taskId, agent: "develop", message });
}

export async function runDevelopTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error("Tarea no encontrada");

  const attempt = task.attempt + 1;
  await db
    .update(tasks)
    .set({ status: "en_curso", attempt, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await log(task.runId, taskId, `Empieza la tarea (intento ${attempt}): ${task.title}`);

  try {
    const current = await latestFiles(task.runId);
    const filesText = [...current.entries()]
      .map(([p, f]) => `--- ${p} ---\n${f.content}`)
      .join("\n\n");

    const prompt =
      `Tarea: ${task.title}\n${task.description}\n\n` +
      (task.feedback ? `Fallos de la revisión anterior que debes corregir:\n${task.feedback}\n\n` : "") +
      `Archivos actuales del proyecto:\n${filesText}`;

    const out = await askJson(SYSTEM, prompt, outSchema);

    for (const f of out.files) {
      const version = (current.get(f.path)?.version ?? 0) + 1;
      await db.insert(artifacts).values({ runId: task.runId, path: f.path, content: f.content, version });
      await log(task.runId, taskId, `Escribe ${f.path} (v${version})`);
    }

    await db
      .update(tasks)
      .set({ status: "en_revision", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await log(task.runId, taskId, `Tarea entregada: ${out.summary}`);
    } catch (e) {
    // Error técnico (límite de cuota, JSON inválido...): no cuenta como intento
    await db
      .update(tasks)
      .set({
        status: task.feedback ? "fallida" : "pendiente",
        attempt: task.attempt,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await log(
      task.runId,
      taskId,
      `Error técnico (no cuenta como intento): ${String((e as Error).message).slice(0, 200)}`
    );
    throw e;
  }
}