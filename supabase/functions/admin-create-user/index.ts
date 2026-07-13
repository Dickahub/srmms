// Creates an auth user via the Admin API (service role — never exposed to the
// browser), then their profiles/user_roles rows. Rolls back (deletes the auth
// user) if either follow-up insert fails, so no half-created account remains.
// Only callable by an authenticated Admin — verified via the caller's own JWT.
import { createClient } from "npm:@supabase/supabase-js@2";

interface RequestBody {
  name?: string;
  email?: string;
  password?: string;
  role?: "Admin" | "Technician" | "Receptionist";
  technicianLevel?: "Level 1" | "Level 2" | null;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[admin-create-user] Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY function secrets");
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const callerToken = authHeader.replace("Bearer ", "");

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Verify the caller's own JWT (service-role clients can validate an arbitrary
  // token via auth.getUser(jwt) — no separate anon-key client needed).
  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken);
  if (callerError || !callerData.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Confirm the caller actually has the Admin role. Checked via the service-role
  // client (bypasses RLS), so this is reliable regardless of who's asking.
  const { data: adminRoleRows, error: roleCheckError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerData.user.id)
    .eq("role", "Admin")
    .limit(1);
  if (roleCheckError) {
    console.error("[admin-create-user] Role check failed:", roleCheckError.message);
    return json({ error: "Server error" }, 500);
  }
  if (!adminRoleRows || adminRoleRows.length === 0) {
    return json({ error: "Only Admins can create users" }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const password = body.password;
  const role = body.role;
  const technicianLevel = body.technicianLevel ?? null;

  if (!name || !email || !password || !role) {
    return json({ error: "name, email, password and role are required" }, 400);
  }
  if (!["Admin", "Technician", "Receptionist"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }
  if (role === "Technician" && technicianLevel !== "Level 1" && technicianLevel !== "Level 2") {
    return json({ error: "Technician level is required for the Technician role" }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message || "Failed to create user" }, 400);
  }

  const newUserId = created.user.id;

  // handle_new_user() already created a `profiles` row from user_metadata.name —
  // this just also sets technician_level (and re-confirms name) explicitly.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ name, technician_level: role === "Technician" ? technicianLevel : null })
    .eq("id", newUserId);

  let roleError: { message: string } | null = null;
  if (!profileError) {
    const res = await admin.from("user_roles").insert({ user_id: newUserId, role });
    roleError = res.error;
  }

  if (profileError || roleError) {
    console.error(
      "[admin-create-user] Post-creation step failed, rolling back auth user:",
      (profileError ?? roleError)?.message,
    );
    await admin.auth.admin.deleteUser(newUserId);
    return json({ error: "Failed to finish setting up the account; nothing was created" }, 500);
  }

  // Audit entry, attributed to the verified caller — inserted directly rather than
  // relying on tg_audit's auth.uid(), which would be null here (we're acting via
  // the service-role client, not the caller's own session).
  const { error: auditError } = await admin.from("audit_log").insert({
    actor_user_id: callerData.user.id,
    actor_email: callerData.user.email ?? null,
    action: "insert",
    entity_type: "user",
    entity_id: newUserId,
    entity_label: `${name} (${email})`,
    diff: { name, email, role, technician_level: technicianLevel },
  });
  if (auditError) {
    // Non-fatal: the account is fully set up either way, just log it.
    console.error("[admin-create-user] Failed to write audit_log row:", auditError.message);
  }

  return json({ userId: newUserId });
});
