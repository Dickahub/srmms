// Sends a single "email" notification via Resend, then marks it sent/failed.
// Invoked server-side by trg_send_email_notification (pg_net, see the
// notifications_pg_net_dispatch migration) right after a qualifying row is
// inserted — no browser involvement needed. Can also be invoked manually with
// just a notificationId to retry/backfill an existing row (e.g. one stuck at
// delivery_status = null from before pg_net dispatch existed) — see README.md.
//
// Deno.serve / npm: specifiers are the standard Supabase Edge Function runtime
// conventions (Deno, not Node) — see README.md for deploy + secret setup.
import { createClient } from "npm:@supabase/supabase-js@2";

interface RequestBody {
  notificationId?: string;
  recipient?: string;
  title?: string;
  body?: string;
}

// Standard Supabase Edge Function CORS pattern — the browser sends a preflight
// OPTIONS request before the real POST since supabase.functions.invoke() adds
// custom headers (authorization, apikey, x-client-info), which makes this a
// non-simple cross-origin request.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let reqBody: RequestBody;
  try {
    reqBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const notificationId = reqBody.notificationId;
  if (!notificationId) {
    return json({ error: "notificationId is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[send-notification-email] Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY function secrets");
    return json({ ok: false, reason: "server_misconfigured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let recipient = reqBody.recipient;
  let title = reqBody.title;
  let messageBody = reqBody.body;

  // Manual retry / backfill path: the trigger always sends recipient/title/body
  // inline (it already has them), but a caller retrying an existing row by id
  // alone needs them looked up. Also guards against re-sending an already
  // processed row when used this way.
  if (!recipient || !messageBody) {
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("id, recipient, title, body, channel, delivery_status")
      .eq("id", notificationId)
      .maybeSingle();

    if (fetchError) {
      console.error("[send-notification-email] Failed to look up notification:", fetchError.message);
      return json({ ok: false, reason: "lookup_failed" });
    }
    if (!notification) {
      return json({ ok: false, reason: "not_found" }, 404);
    }
    if (notification.channel !== "email" || !notification.recipient) {
      return json({ ok: true, skipped: true });
    }
    if (notification.delivery_status != null) {
      // Already sent/failed — a manual retry call shouldn't re-send silently.
      return json({ ok: true, skipped: true, reason: "already_processed" });
    }
    recipient = notification.recipient;
    title = notification.title ?? undefined;
    messageBody = notification.body ?? undefined;
  }

  if (!recipient || !messageBody) {
    return json({ ok: false, reason: "missing_recipient_or_body" });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn(
      `[send-notification-email] RESEND_API_KEY is not set — marking notification ${notificationId} as failed`,
    );
    await supabase.from("notifications").update({ delivery_status: "failed" }).eq("id", notificationId);
    return json({ ok: false, reason: "missing_api_key" });
  }

  // Resend free-tier constraints (no verified domain): sender must be
  // onboarding@resend.dev, and delivery only actually reaches the Resend
  // account owner's own email address — see README.md.
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: title || "Update on your repair",
        text: messageBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[send-notification-email] Resend API error (${res.status}): ${errText}`);
      await supabase.from("notifications").update({ delivery_status: "failed" }).eq("id", notificationId);
      return json({ ok: false, reason: "resend_error" });
    }

    await supabase.from("notifications").update({ delivery_status: "sent" }).eq("id", notificationId);
    return json({ ok: true });
  } catch (err) {
    console.error("[send-notification-email] Unexpected error calling Resend:", err);
    await supabase.from("notifications").update({ delivery_status: "failed" }).eq("id", notificationId);
    return json({ ok: false, reason: "exception" });
  }
});
