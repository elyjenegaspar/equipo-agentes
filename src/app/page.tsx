import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

async function Gate() {
  if (!(await isAuthed())) redirect("/login");
  return <Dashboard />;
}

export default function Home() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-gray-500">Cargando…</p>}>
      <Gate />
    </Suspense>
  );
}