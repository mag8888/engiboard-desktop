// supabase/functions/license-heartbeat — клиент шлёт каждые ~60 минут.
// Сервер: валидирует прежний eb-license-jwt, сверяет fingerprint, продлевает
// сессию и выдаёт свежий JWT. Phase 2 из docs/SECURITY_PLAN.md.
//
// Запрос (POST):
//   header: Authorization: Bearer <eb-license-jwt>
//   body: { machine_fingerprint: "<sha256>" }
//
// Ответ 200:
//   { jwt, expires_at }
// Ошибки:
//   401 — нет/невалидный jwt
//   403 — fingerprint_mismatch / session_revoked / license_expired
//   404 — session не найдена

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.9.4/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = new TextEncoder().encode(Deno.env.get("LICENSE_JWT_SECRET")!);
const JWT_TTL_HOURS = 24;

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "no_jwt" }, 401);

  let payload: jose.JWTPayload;
  try {
    const r = await jose.jwtVerify(token, JWT_SECRET);
    payload = r.payload;
  } catch {
    return json({ error: "bad_jwt" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const { machine_fingerprint } = body as Record<string, string>;
  if (!machine_fingerprint) return json({ error: "missing_fingerprint" }, 400);
  if (machine_fingerprint !== payload.fingerprint_hash) {
    return json({ error: "fingerprint_mismatch" }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // проверяем что лицензия ещё валидна
  const { data: lic } = await supabase
    .from("licenses")
    .select("*")
    .eq("id", payload.license_id as string)
    .single();
  if (!lic) return json({ error: "license_gone" }, 404);
  if (lic.status !== "active") return json({ error: `license_${lic.status}` }, 403);
  if (new Date(lic.expires_at) < new Date()) return json({ error: "license_expired" }, 403);

  // update сессии
  const { data: session, error: updErr } = await supabase
    .from("license_sessions")
    .update({
      last_heartbeat_at: new Date().toISOString(),
      jwt_issued_at: new Date().toISOString(),
    })
    .eq("license_id", payload.license_id as string)
    .eq("machine_fingerprint", machine_fingerprint)
    .select()
    .single();

  if (updErr || !session) return json({ error: "session_not_found" }, 404);

  // выдаём свежий JWT
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_HOURS * 3600;
  const fresh = await new jose.SignJWT({
    sub: payload.sub,
    license_id: payload.license_id,
    fingerprint_hash: machine_fingerprint,
    plan: lic.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  return json({ jwt: fresh, expires_at: new Date(exp * 1000).toISOString() });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
