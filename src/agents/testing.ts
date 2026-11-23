import ts from "typescript";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, tasks, events } from "@/db/schema";
import { askJson } from "@/lib/llm";
import { latestFiles } from "./develop";

const checksSchema = z.object({
  checks: z
    .array(
      z.object({
        description: z.string().min(3),
        file: z.string().min(3),
        type: z.enum(["contains", "not_contains", "regex"]),
        value: z.string().min(1),
      })
    )
    .min(1)
    .max(8),
});

const SYSTEM = `Eres Testing, un agente que revisa el trabajo de otro agente (Develop) en un proyecto Next.js.
Recibes la descripción de una tarea y la lista de archivos del proyecto.
Devuelve entre 2 y 5 comprobaciones automáticas sobre el CONTENIDO de los archivos.
Reglas estrictas:
- Comprueba SOLO lo que la descripción de la tarea pide de forma literal: textos visibles, etiquetas, rutas de enlace (href) y nombres de archivo.
- NO compruebes imports, orden de atributos, estructura de componentes ni clases de Tailwind, salvo que la tarea nombre una clase concreta.
- "file" debe ser una ruta de la lista, o la ruta que la descripción nombra de forma explícita.
- type "contains": el archivo contiene el texto literal "value" (solo texto visible, sin etiquetas HTML ni comillas, por ejemplo: Contacto). type "not_contains": no lo contiene.
- type "regex": solo para atributos y debe ser simple, por ejemplo href=["']/contacto["'] o type=["']email["']. Sin [^>] ni \\s+ ni cadenas de varias condiciones.
- "description" explica en español qué se comprueba.
Formato exacto: {"checks":[{"description":"...","file":"...","type":"contains|not_contains|regex","value":"..."}]}`;

type Files = Awaited<ReturnType<typeof latestFiles>>;
type Check = z.infer<typeof checksSchema>["checks"][number];

function isSane(c: Check, files: Files, description: string) {
  if (!files.has(c.file) && !description.includes(c.file)) return false;
  if (c.value.length > 80) return false;
  if (/\[\^>\]|\\s\+|^import\b/.test(c.value)) return false;
  if (c.type !== "regex" && c.value.includes("<")) return false;
  return true;
}

function staticChecks(path: string, content: string): string[] {
  const problems: string[] = [];

  const out = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
  for (const d of out.diagnostics ?? []) {
    problems.push(
      `${path}: error de sintaxis: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`
    );
  }

  const usesClient =
    /\b(useState|useEffect|useRef|useReducer)\b|\bon(Submit|Click|Change)=/.test(content);
  if (usesClient && !/^\s*["']use client["']/.test(content)) {
    problems.push(`${path}: usa estado o eventos pero no empieza con "use client";`);
  }

  if (path.endsWith("/page.tsx") && !/export\s+default/.test(content)) {
    problems.push(`${path}: falta "export default"`);
  }
  return problems;
}

function allStaticChecks(files: Files): string[] {
  return [...files.entries()].flatMap(([path, f]) => staticChecks(path, f.content));
}

function runCheck(c: z.infer<typeof checksSchema>["checks"][number], files: Files) {
  const f = files.get(c.file);
  if (!f) return `${c.description}: el archivo ${c.file} no existe`;
  if (c.type === "contains") {
    return f.content.includes(c.value)
      ? null
      : `${c.description}: no se encuentra «${c.value}» en ${c.file}`;
  }
  if (c.type === "not_contains") {
    return f.content.includes(c.value)
      ? `${c.description}: no debería aparecer «${c.value}» en ${c.file}`
      : null;
  }
  try {
    return new RegExp(c.value, "i").test(f.content)
      ? null
      : `${c.description}: no se cumple el patrón ${c.value} en ${c.file}`;
  } catch {
    return null; // expresión inválida generada por el modelo: se ignora
  }
}

async function log(runId: string, taskId: string, message: string) {
  await db.insert(events).values({ runId, taskId, agent: "testing", message });
}

export async function reviewDevelopTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error("Tarea no encontrada");

  const files = await latestFiles(task.runId);

  let checks: Check[];
  if (task.checks) {
    checks = JSON.parse(task.checks) as Check[];
  } else {
    const plan = await askJson(
      SYSTEM,
      `Tarea: ${task.title}\n${task.description}\n\nArchivos del proyecto:\n${[...files.keys()].join("\n")}`,
      checksSchema
    );
    checks = plan.checks.filter((c) => isSane(c, files, task.description));
    await db
      .update(tasks)
      .set({ checks: JSON.stringify(checks) })
      .where(eq(tasks.id, taskId));
  }

  await log(task.runId, taskId, `Revisa la tarea: ${task.title} (${checks.length} comprobaciones)`);

  const failures = [
    ...allStaticChecks(files),
    ...checks.map((c) => runCheck(c, files)).filter((x): x is string => x !== null),
  ];

  if (failures.length === 0) {
    await db
      .update(tasks)
      .set({ status: "aprobada", feedback: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await log(task.runId, taskId, `Aprobada: ${checks.length} comprobaciones y revisión de código superadas`);
    return;
  }

  await db
    .update(tasks)
    .set({ status: "fallida", feedback: failures.join("\n"), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await log(task.runId, taskId, `Fallida: ${failures.length} problema(s)`);
  for (const f of failures) await log(task.runId, taskId, `- ${f}`);
}

export async function finalizeRun(runId: string) {
  const all = await db.select().from(tasks).where(eq(tasks.runId, runId));
  const dev = all.filter((t) => t.assignee === "develop");
  const testingTasks = all.filter((t) => t.assignee === "testing");
  const logTesting = async (msg: string) => {
    const id = testingTasks[0]?.id;
    if (id) await log(runId, id, msg);
  };

  const exhausted = dev.filter((t) => t.status !== "aprobada");
  let finalStatus: "completada" | "fallida" = "completada";

  if (exhausted.length > 0) {
    finalStatus = "fallida";
    await logTesting(
      `El equipo se detiene: ${exhausted.length} tarea(s) sin aprobar tras agotar los intentos`
    );
  } else {
    const files = await latestFiles(runId);
    const problems = allStaticChecks(files);
    if (problems.length > 0) {
      finalStatus = "fallida";
      for (const p of problems) await logTesting(`- ${p}`);
    } else {
      await logTesting(`Revisión final superada: ${files.size} archivos sin errores`);
    }
  }

  for (const t of testingTasks) {
    await db
      .update(tasks)
      .set({ status: finalStatus === "completada" ? "aprobada" : "fallida", updatedAt: new Date() })
      .where(eq(tasks.id, t.id));
  }
  await db.update(runs).set({ status: finalStatus }).where(eq(runs.id, runId));
  return finalStatus;
}