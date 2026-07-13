// AI diagnostic assistant for technicians, powered by Google Gemini (free tier).
// Invoked from the repair detail page's "Assistant Diagnostic" chat panel.
//
// Deno.serve / npm: specifiers are the standard Supabase Edge Function runtime
// conventions (Deno, not Node) — see README.md for deploy + secret setup.
import { createClient } from "npm:@supabase/supabase-js@2";

interface RequestBody {
  repair_id?: string;
  message?: string;
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

// Configurable via optional function secrets (GEMINI_MODEL_PRIMARY /
// GEMINI_MODEL_FALLBACK) so the models can be swapped via `supabase secrets
// set` alone, no code change — see README.md. Fall back to these defaults
// when unset.
const PRIMARY_MODEL = Deno.env.get("GEMINI_MODEL_PRIMARY") || "gemini-3.1-flash-lite";
const FALLBACK_MODEL = Deno.env.get("GEMINI_MODEL_FALLBACK") || "gemini-flash-latest";

async function callGemini(model: string, apiKey: string, body: unknown): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[diagnostic-assistant] Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY function secrets");
    return json({ error: "Server misconfigured" }, 500);
  }
  if (!geminiApiKey) {
    console.error("[diagnostic-assistant] Missing GEMINI_API_KEY function secret");
    return json({ error: "The diagnostic assistant is not configured." }, 500);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const callerToken = authHeader.replace("Bearer ", "");

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken);
  if (callerError || !callerData.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: roleRows, error: roleCheckError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerData.user.id)
    .in("role", ["Admin", "Technician"])
    .limit(1);
  if (roleCheckError) {
    console.error("[diagnostic-assistant] Role check failed:", roleCheckError.message);
    return json({ error: "Server error" }, 500);
  }
  if (!roleRows || roleRows.length === 0) {
    return json({ error: "Only Admin or Technician accounts can use the diagnostic assistant" }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const repairId = body.repair_id;
  const message = body.message?.trim();
  if (!repairId || !message) {
    return json({ error: "repair_id and message are required" }, 400);
  }

  // ---- Gather context ------------------------------------------------------
  const { data: repair, error: repairError } = await admin
    .from("repairs")
    .select(
      "order_number, status, description, diagnosis, machine_id, machine:machines(machine_type,brand,model,serial_number)",
    )
    .eq("id", repairId)
    .maybeSingle();
  if (repairError || !repair) {
    return json({ error: "Repair not found" }, 404);
  }

  const machine = Array.isArray(repair.machine) ? repair.machine[0] : repair.machine;

  const { data: pastRepairs } = repair.machine_id
    ? await admin
        .from("repairs")
        .select("order_number, created_at, status, diagnosis")
        .eq("machine_id", repair.machine_id)
        .neq("id", repairId)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as { order_number: string; created_at: string; status: string; diagnosis: string | null }[] };

  const { data: repairLogs } = await admin
    .from("repair_logs")
    .select("action, result")
    .eq("repair_id", repairId)
    .order("created_at", { ascending: true });

  const { data: recentChatsDesc } = await admin
    .from("diagnostic_chats")
    .select("role, message")
    .eq("repair_id", repairId)
    .order("created_at", { ascending: false })
    .limit(10);
  const priorChats = (recentChatsDesc ?? []).slice().reverse();

  // ---- Build the Gemini request --------------------------------------------
  const equipmentLine = [machine?.machine_type, machine?.brand, machine?.model].filter(Boolean).join(" ") || "Not specified";

  const pastRepairsText = (pastRepairs ?? []).length
    ? (pastRepairs ?? [])
        .map((r) => `- ${r.created_at.slice(0, 10)} (${r.order_number}): final status "${r.status}", diagnosis: ${r.diagnosis ?? "N/A"}`)
        .join("\n")
    : "No previous repairs on record for this equipment.";

  const repairLogsText = (repairLogs ?? []).length
    ? (repairLogs ?? []).map((l) => `- ${l.action}${l.result ? " → " + l.result : ""}`).join("\n")
    : "No actions logged yet on this repair.";

  const equipmentContext = `Repair number: ${repair.order_number}
Current status: ${repair.status}
Equipment: ${equipmentLine}
Serial number: ${machine?.serial_number ?? "N/A"}
Problem description / condition on arrival: ${repair.description ?? "Not provided"}
Current diagnosis: ${repair.diagnosis ?? "No diagnosis recorded yet"}

History of previous repairs for this equipment (most recent first):
${pastRepairsText}

Log of actions already taken on this repair:
${repairLogsText}`;

  const systemInstructionText = `You are a diagnostic assistant for technicians at an IT services company in Cameroon (SECEL). You help diagnose faults in IT equipment (computers, printers, UPS units, network equipment). You reason like a senior technician: ask clarifying questions when needed, propose checks ordered from simplest/most probable to most complex, and briefly explain the why of each check. Respond concisely and in structured form, in English. Remind the technician when relevant that they should physically verify before drawing any conclusion, and never present your hypotheses as certainties.

Equipment context:
${equipmentContext}`;

  const contents = [
    ...priorChats.map((c) => ({ role: c.role === "assistant" ? "model" : "user", parts: [{ text: c.message }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const geminiBody = {
    systemInstruction: { parts: [{ text: systemInstructionText }] },
    contents,
  };

  // ---- Call Gemini, falling back to the secondary model on 429 (rate limit)
  // or 404 (model not found/renamed/deprecated) from the primary — any other
  // failure is reported as-is with no fallback attempt. "Temporarily
  // overloaded" is only reported when both models are rate-limited.
  let res = await callGemini(PRIMARY_MODEL, geminiApiKey, geminiBody);
  let servedBy = PRIMARY_MODEL;
  const primaryStatus = res.status;

  if (!res.ok && (primaryStatus === 429 || primaryStatus === 404)) {
    console.warn(`[diagnostic-assistant] Primary model ${PRIMARY_MODEL} failed (${primaryStatus}), falling back to ${FALLBACK_MODEL}`);
    res = await callGemini(FALLBACK_MODEL, geminiApiKey, geminiBody);
    servedBy = FALLBACK_MODEL;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[diagnostic-assistant] Gemini API error (${res.status}): ${errText}`);
    if (primaryStatus === 429 && res.status === 429) {
      return json({ error: "The assistant is temporarily overloaded, please try again in a minute." }, 429);
    }
    return json({ error: "The diagnostic assistant is temporarily unavailable. Please try again later." }, 502);
  }

  let replyText = "";
  try {
    const data = await res.json();
    replyText = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
  } catch (err) {
    console.error("[diagnostic-assistant] Failed to parse Gemini response:", err);
  }

  if (!replyText) {
    console.error("[diagnostic-assistant] Gemini returned no usable reply");
    return json({ error: "The diagnostic assistant is temporarily unavailable. Please try again later." }, 502);
  }

  console.log(`[diagnostic-assistant] Response served by ${servedBy}`);

  // Best-effort persistence — the reply already exists, don't lose it over a save hiccup.
  const { error: saveError } = await admin.from("diagnostic_chats").insert([
    { repair_id: repairId, role: "user", message, created_by: callerData.user.id },
    { repair_id: repairId, role: "assistant", message: replyText, created_by: callerData.user.id },
  ]);
  if (saveError) {
    console.error("[diagnostic-assistant] Failed to save chat messages:", saveError.message);
  }

  return json({ reply: replyText });
});
