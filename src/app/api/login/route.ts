import { cookies } from "next/headers";
import { z } from "zod";
import { checkCredentials, createToken, SESSION_COOKIE } from "@/lib/auth";

const schema = z.object({ user: z.string().max(100), password: z.string().max(200) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !checkCredentials(parsed.data.user, parsed.data.password)) {
    return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE.name, createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE.maxAge,
  });
  return Response.json({ ok: true });
}