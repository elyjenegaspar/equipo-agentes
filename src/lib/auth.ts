import { connection } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const NAME = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export const SESSION_COOKIE = { name: NAME, maxAge: MAX_AGE };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Falta SESSION_SECRET");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkCredentials(user: string, password: string) {
  const u = process.env.APP_USER ?? "";
  const p = process.env.APP_PASSWORD ?? "";
  if (!u || !p) return false;
  return safeEqual(user, u) && safeEqual(password, p);
}

export function createToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${exp}.${sign(exp)}`;
}

function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

export async function isAuthed() {
	await connection();
	const store = await cookies();
	try {
	return verifyToken(store.get(NAME)?.value);
	} catch {
	return false;
	}
}