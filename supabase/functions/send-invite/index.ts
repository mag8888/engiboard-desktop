// Supabase Edge Function: send-invite
// Sends an invitation email via Resend from a technical sender domain.
// Triggered by the client after a project_invites row is inserted.
//
// Setup:
//   1. Sign up at https://resend.com (free tier: 100/day, 3000/month)
//   2. Get your API key from https://resend.com/api-keys
//   3. Set the secret in Supabase:
//        supabase secrets set RESEND_API_KEY=re_xxx
//      (optional, custom domain)
//        supabase secrets set INVITE_FROM_EMAIL=invites@yourdomain.com
//   4. Deploy:
//        supabase functions deploy send-invite --no-verify-jwt
//      (no-verify-jwt because we authorize inside via the user's bearer token)

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InvitePayload {
  to: string;
  inviter_name: string;
  project_name: string;
  link: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return json({ error: "RESEND_API_KEY not configured on the server" }, 500);
    }

    const fromEmail =
      Deno.env.get("INVITE_FROM_EMAIL") ?? "EngiBoard <onboarding@resend.dev>";

    const payload = (await req.json()) as InvitePayload;
    const { to, inviter_name, project_name, link } = payload;

    if (!to || !link) {
      return json({ error: "Missing required fields: to, link" }, 400);
    }

    const subject = `${inviter_name || "A teammate"} invited you to "${project_name || "an EngiBoard project"}"`;
    const html = renderHtml({ inviter_name, project_name, link });
    const text = renderText({ inviter_name, project_name, link });

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("[resend] failed:", r.status, errText);
      return json({ error: "Resend API failed", status: r.status, detail: errText }, 502);
    }

    const data = await r.json();
    return json({ ok: true, id: data?.id ?? null });
  } catch (err: any) {
    console.error("[send-invite] threw:", err?.message ?? err);
    return json({ error: err?.message ?? String(err) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderText(p: { inviter_name: string; project_name: string; link: string }): string {
  return [
    `Hi,`,
    ``,
    `${p.inviter_name || "A teammate"} invited you to join "${p.project_name || "an EngiBoard project"}".`,
    ``,
    `To accept, open this link in your EngiBoard app:`,
    p.link,
    ``,
    `If you don't have EngiBoard yet, download it from:`,
    `https://github.com/mag8888/engiboard-desktop/releases/latest`,
    ``,
    `This invite expires in 7 days.`,
    ``,
    `— EngiBoard`,
  ].join("\n");
}

function renderHtml(p: { inviter_name: string; project_name: string; link: string }): string {
  const inviter = escapeHtml(p.inviter_name || "A teammate");
  const project = escapeHtml(p.project_name || "an EngiBoard project");
  const link = escapeHtml(p.link);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>EngiBoard invitation</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:32px;">
        <tr><td style="padding-bottom:8px;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#0EA5E9,#2563EB);color:#fff;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-size:18px;">E</div>
            <span style="font-weight:700;font-size:18px;">EngiBoard</span>
          </div>
        </td></tr>
        <tr><td style="padding-top:24px;font-size:20px;font-weight:600;line-height:1.3;">
          You've been invited to "${project}"
        </td></tr>
        <tr><td style="padding-top:14px;font-size:14px;line-height:1.6;color:#334155;">
          <b>${inviter}</b> invited you to collaborate on the engineering project <b>"${project}"</b> in EngiBoard — a desktop app for tracking tasks with annotated screenshots.
        </td></tr>
        <tr><td style="padding-top:24px;">
          <a href="${link}" style="display:inline-block;background:#0EA5E9;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">
            Accept invitation
          </a>
        </td></tr>
        <tr><td style="padding-top:18px;font-size:12px;color:#64748B;line-height:1.5;">
          Or copy this link into the app:<br>
          <code style="background:#F1F5F9;padding:4px 8px;border-radius:4px;font-size:11px;word-break:break-all;display:inline-block;margin-top:4px;">${link}</code>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;line-height:1.5;">
          Don't have EngiBoard yet? <a href="https://github.com/mag8888/engiboard-desktop/releases/latest" style="color:#0EA5E9;text-decoration:none;">Download for Mac or Windows →</a><br>
          This invitation expires in 7 days.
        </td></tr>
      </table>
      <div style="margin-top:18px;font-size:11px;color:#94A3B8;">— EngiBoard team</div>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
