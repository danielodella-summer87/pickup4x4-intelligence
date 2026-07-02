/**
 * Gate de acceso a la app interna. Next.js 16 renombró "middleware" a
 * "proxy" (mismo archivo/convención, ver node_modules/next/dist/docs).
 *
 * Público sin sesión: /encuesta/*, /login, /api/auth/login, /api/auth/logout,
 * /api/encuestas/* (envío de la encuesta pública). Todo lo demás requiere la
 * cookie de sesión firmada (ver lib/auth/session.ts).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getAdminCredentials,
  isValidSessionCookieValue,
} from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/encuesta",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/encuestas",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const RESTRICTED_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Acceso restringido · Pickup 4x4</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:26rem;padding:2rem;text-align:center;">
    <p style="margin:0 0 0.5rem;font-size:0.75rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#34d399;">Pickup 4x4 Intelligence</p>
    <h1 style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:700;">Acceso restringido</h1>
    <p style="margin:0;font-size:0.925rem;color:#94a3b8;">El acceso interno no está disponible en este momento.</p>
  </div>
</body>
</html>`;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const creds = getAdminCredentials();

  if (!creds) {
    // Producción sin PICKUP_ADMIN_USER/PASSWORD configuradas: bloquear todo
    // acceso interno en lugar de dejarlo abierto o loopear a un /login inútil.
    if (isApi) {
      return NextResponse.json(
        { error: "Acceso interno no configurado." },
        { status: 503 },
      );
    }
    return new NextResponse(RESTRICTED_HTML, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionCookieValue(cookieValue, creds)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
