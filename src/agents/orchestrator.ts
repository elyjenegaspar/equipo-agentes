import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, tasks, events, artifacts } from "@/db/schema";
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

const BASE_FILES: Record<string, string> = {
  "src/app/layout.tsx": `import NavBar from "@/components/NavBar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
  "src/app/page.tsx": `export default function Home() {
  return <h1>Inicio</h1>;
}
`,
  "src/components/NavBar.tsx": `import Link from "next/link";

export default function NavBar() {
  return (
    <nav>
      <Link href="/">Inicio</Link>
    </nav>
  );
}
`,
};

const SYSTEM = `Eres el Orquestador de un equipo de 2 agentes:
- "develop": escribe código (archivos TypeScript/React de Next.js).
- "testing": comprueba el trabajo de develop y reporta lo que falla.
La web objetivo es un sitio Next.js (App Router, TypeScript) que ya contiene exactamente estos archivos: src/app/layout.tsx, src/app/page.tsx y src/components/NavBar.tsx.
Las tareas deben crear o modificar solo archivos con rutas de este estilo: src/app/<ruta>/page.tsx y src/components/<Nombre>.tsx. No uses react-router, ni src/pages, ni App.tsx, ni CSS modules: usa clases de Tailwind.
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
  
  await db.insert(artifacts).values(
    Object.entries(BASE_FILES).map(([path, content]) => ({
      runId: run.id,
      path,
      content,
      version: 1,
    }))
  );

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