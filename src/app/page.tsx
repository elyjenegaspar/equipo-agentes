"use client";

import { useEffect, useState } from "react";

type Agent = "orquestador" | "develop" | "testing";
type Task = {
  id: string;
  title: string;
  description: string;
  assignee: "develop" | "testing";
  status: string;
  attempt: number;
  position: number;
  feedback: string | null;
};
type AgentEvent = { id: string; agent: Agent; message: string; createdAt: string };
type FileItem = { path: string; version: number; content: string };
type RunData = {
  run: { id: string; request: string; status: string };
  tasks: Task[];
  events: AgentEvent[];
  files: FileItem[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COLUMNS = [
  { key: "pendiente", label: "Pendiente", style: "bg-gray-100 text-gray-700" },
  { key: "en_curso", label: "En curso", style: "bg-blue-100 text-blue-800" },
  { key: "en_revision", label: "En revisión", style: "bg-amber-100 text-amber-800" },
  { key: "fallida", label: "Fallida", style: "bg-red-100 text-red-800" },
  { key: "aprobada", label: "Aprobada", style: "bg-green-100 text-green-800" },
];

const AGENTS: { key: Agent; label: string; role: string; color: string }[] = [
  { key: "orquestador", label: "Orquestador", role: "Reparte el trabajo", color: "border-purple-400" },
  { key: "develop", label: "Develop", role: "Escribe el código", color: "border-blue-400" },
  { key: "testing", label: "Testing", role: "Comprueba y devuelve fallos", color: "border-green-400" },
];

const AGENT_TEXT: Record<Agent, string> = {
  orquestador: "text-purple-700",
  develop: "text-blue-700",
  testing: "text-green-700",
};

function agentStatus(agent: Agent, data: RunData | null, planning: boolean) {
  if (planning) {
    return agent === "orquestador"
      ? { label: "Planificando…", active: true }
      : { label: "Esperando", active: false };
  }
  if (!data) return { label: "Inactivo", active: false };

  const { tasks, run } = data;
  const running = run.status === "en_curso";

  if (agent === "orquestador") {
    if (tasks.length === 0) {
      return run.status === "fallida"
        ? { label: "No pudo crear el plan", active: false }
        : { label: "Planificando…", active: true };
    }
    return { label: `Plan listo: ${tasks.length} tareas`, active: false };
  }

  if (agent === "develop") {
    const t = tasks.find((x) => x.status === "en_curso");
    if (t) return { label: `Programando: ${t.title}`, active: true };
    return { label: running ? "Esperando tarea" : "Inactivo", active: false };
  }

  const t = tasks.find((x) => x.assignee === "develop" && x.status === "en_revision");
  if (t) return { label: `Revisando: ${t.title}`, active: true };
  if (running) return { label: "Esperando entrega", active: false };
  return {
    label: run.status === "completada" ? "Revisión final superada" : "Detenido",
    active: false,
  };
}

export default function Home() {
  const [request, setRequest] = useState("Añade una página de contacto a esta web");
  const [runId, setRunId] = useState<string | null>(null);
  const [data, setData] = useState<RunData | null>(null);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consulta el estado cada 1,5 s mientras la ejecución esté en marcha
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await fetch(`/api/runs/${runId}`);
          if (r.ok) {
            const d = (await r.json()) as RunData;
            if (stop) return;
            setData(d);
            if (d.run.status !== "en_curso" && !busy) return;
          }
        } catch {
          // se reintenta en la siguiente vuelta
        }
        await sleep(1500);
      }
    })();
    return () => {
      stop = true;
    };
  }, [runId, busy]);

  // Va llamando a /step hasta que la ejecución termina
  async function drive(id: string) {
    setBusy(true);
    let errors = 0;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`/api/runs/${id}/step`, { method: "POST" });
        if (r.ok) {
          errors = 0;
          const s = await r.json();
          if (s.done) break;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
      if (errors >= 5) {
        setError("Se detuvo por errores repetidos. Pulsa «Continuar» para reintentar.");
        break;
      }
      await sleep(errors > 0 ? 8000 : 2500);
    }
    setBusy(false);
  }

  async function start() {
    setError(null);
    setData(null);
    setRunId(null);
    setPlanning(true);
    setBusy(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo crear la ejecución");
      setRunId(json.runId);
      setPlanning(false);
      await drive(json.runId);
    } catch (e) {
      setError((e as Error).message);
      setPlanning(false);
      setBusy(false);
    }
  }

  const canResume = !!runId && data?.run.status === "en_curso" && !busy;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-bold">Equipo de agentes</h1>
          <p className="text-sm text-gray-600">
            Un Orquestador reparte el trabajo, Develop programa y Testing comprueba hasta que todo pasa.
          </p>
        </header>

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <label htmlFor="request" className="mb-2 block text-sm font-medium">
            Petición
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={busy}
              maxLength={500}
              className="w-full rounded border p-2 disabled:bg-gray-100"
            />
            <button
              onClick={start}
              disabled={busy || request.trim().length < 5}
              className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? "Trabajando…" : "Lanzar"}
            </button>
            {canResume && (
              <button
                onClick={() => {
                  setError(null);
                  drive(runId!);
                }}
                className="rounded border px-4 py-2"
              >
                Continuar
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {data && (
            <p className="mt-2 text-sm text-gray-600">
              Estado de la ejecución: <strong>{data.run.status.replace("_", " ")}</strong>
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {AGENTS.map((a) => {
            const s = agentStatus(a.key, data, planning);
            return (
              <div key={a.key} className={`rounded-lg border-l-4 bg-white p-4 shadow-sm ${a.color}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{a.label}</h2>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${s.active ? "animate-pulse bg-green-500" : "bg-gray-300"}`}
                  />
                </div>
                <p className="text-xs text-gray-500">{a.role}</p>
                <p className="mt-2 text-sm">{s.label}</p>
              </div>
            );
          })}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Tablero de tareas</h2>
          <div className="grid gap-3 md:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = data?.tasks.filter((t) => t.status === col.key) ?? [];
              return (
                <div key={col.key} className="rounded-lg bg-gray-100 p-2">
                  <div className={`mb-2 rounded px-2 py-1 text-xs font-medium ${col.style}`}>
                    {col.label} ({items.length})
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <div key={t.id} className="rounded border bg-white p-2 text-sm shadow-sm">
                        <p className="font-medium">{t.title}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {t.assignee} · intento {t.attempt}
                        </p>
                        {t.feedback && t.status === "fallida" && (
                          <pre className="mt-1 whitespace-pre-wrap text-xs text-red-700">{t.feedback}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold">Registro de actividad</h2>
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {[...(data?.events ?? [])].reverse().map((e) => (
                <li key={e.id}>
                  <span className="text-xs text-gray-400">
                    {new Date(e.createdAt).toLocaleTimeString("es-ES")}{" "}
                  </span>
                  <span className={`font-medium ${AGENT_TEXT[e.agent]}`}>{e.agent}</span>: {e.message}
                </li>
              ))}
              {!data && <li className="text-gray-400">Aún no hay actividad.</li>}
            </ul>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold">Archivos generados</h2>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {(data?.files ?? []).map((f) => (
                <details key={f.path} className="rounded border">
                  <summary className="cursor-pointer p-2 text-sm">
                    {f.path} <span className="text-xs text-gray-500">v{f.version}</span>
                  </summary>
                  <pre className="overflow-x-auto bg-gray-50 p-2 text-xs">{f.content}</pre>
                </details>
              ))}
              {!data && <p className="text-sm text-gray-400">Aún no hay archivos.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}