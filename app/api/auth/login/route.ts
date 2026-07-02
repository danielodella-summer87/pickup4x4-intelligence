import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionCookieValue,
  credentialsMatch,
  getAdminCredentials,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const creds = getAdminCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "Acceso interno no configurado. Contactá al equipo técnico." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const user = typeof record.user === "string" ? record.user.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!user || !password || !credentialsMatch(user, password, creds)) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue(creds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
