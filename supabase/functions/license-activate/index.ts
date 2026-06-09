// supabase/functions/license-activate — обмен license_key + machine_fingerprint
// на short-lived JWT для входа в приложение. Phase 2 из docs/SECURITY_PLAN.md.
//
// Запрос (POST):
//   { license_key: "EB-...", machine_fingerprint: "<sha256>",
//     machine_label: "Aleksey MacBook Pro", os: "macos",
//     app_version: "0.1.159" }
// Заголовок Authorization: Bearer <Supabase auth JWT пользователя>.
//
// Ответ 200:
//   { jwt: "<eb-license-jwt>", expires_at: "...", license: {...} }
// Ошибки:
//   400 — bad body
//   401 — нет auth
//   403 — license_not_found / expired / suspended / no_free_seats / fingerprint_mismatch
//
// JWT-секрет вкладывается через env LICENSE_JWT_SECRET (Supabase Vault).
// Не деплоить эту функцию до согласования с Алексеем — см. SECURITY_PLAN.md §7.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.9.4/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = new TextEncoder().encode(Deno.env.get("LICENSE_JWT_SECRET")!);
const JWT_TTL_HOURS = 24;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // auth юзера
  const authHeader = req.headers.get("Authorization") || "";
  const userJwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!userJwt) return json({ error: "no_auth" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await supabase.auth.getUser(userJwt);
  if (userErr || !userData?.user) return json({ error: "bad_auth" }, 401);
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }

  const { license_key, machine_fingerprint, machine_label, os, app_version } =
    body as Record<string, string>;

  if (!license_key || !machine_fingerprint) {
    return json({ error: "missing_fields" }, 400);
  }

  // ищем license по ключу
  const { data: lic, error: licErr } = await supabase
    .from("licenses")
    .select("*")
    .eq("key", license_key)
    .single();
  if (licErr || !lic) return json({ error: "license_not_found" }, 403);
  if (lic.user_id !== userId) return json({ error: "license_belongs_to_other_user" }, 403);

  // RPC проверяет seats без race
  const { data: canAct, error: rpcErr } = await supabase.rpc("license_can_activate", {
    p_license_id: lic.id,
    p_fingerprint: machine_fingerprint,
  });
  if (rpcErr) return json({ error: "rpc_failed", detail: rpcErr.message }, 500);
  const row = Array.isArray(canAct) ? canAct[0] : canAct;
  if (!row?.ok) return json({ error: row?.reason ?? "denied" }, 403);

  // upsert сессию
  const { error: upsertErr } = await supabase.from("license_sessions").upsert({
    license_id: lic.id,
    user_id: userId,
    machine_fingerprint,
    machine_label: machine_label ?? null,
    os: os ?? null,
    app_version: app_version ?? null,
    last_heartbeat_at: new Date().toISOString(),
    jwt_issued_at: new Date().toISOString(),
  }, { onConflict: "license_id,machine_fingerprint" });
  if (upsertErr) return json({ error: "session_upsert_failed" }, 500);

  // JWT
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_HOURS * 3600;
  const jwt = await new jose.SignJWT({
    sub: userId,
    license_id: lic.id,
    fingerprint_hash: machine_fingerprint,
    plan: lic.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  return json({
    jwt,
    expires_at: new Date(exp * 1000).toISOString(),
    license: {
      id: lic.id,
      plan: lic.plan,
      seats: lic.seats,
      expires_at: lic.expires_at,
    },
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
