import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-current-user";

export type TechnicianLevel = "Level 1" | "Level 2";
export const TECHNICIAN_LEVELS: TechnicianLevel[] = ["Level 1", "Level 2"];

export type UserWithRoles = {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  technician_level: TechnicianLevel | null;
};

// Informational display helper: "Jean K." -> "Jean K. — Level 2" when leveled.
export function technicianDisplayName(u: { name: string; email: string; technician_level: TechnicianLevel | null }): string {
  const base = u.name || u.email;
  return u.technician_level ? `${base} — ${u.technician_level}` : base;
}

export function useUsersWithRoles() {
  return useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,technician_level").order("name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;

      const rolesByUser = new Map<string, AppRole[]>();
      for (const r of roles ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rolesByUser.set(r.user_id, list);
      }

      return (profiles ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        technician_level: p.technician_level as TechnicianLevel | null,
        roles: rolesByUser.get(p.id) ?? [],
      })) as UserWithRoles[];
    },
  });
}

// Informational only — no logic anywhere reads this to auto-assign repairs.
export function useSetTechnicianLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, level }: { userId: string; level: TechnicianLevel }) => {
      const { error } = await supabase.from("profiles").update({ technician_level: level }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-with-roles"] }),
  });
}

// Single-role model: replace whatever roles a user currently has with the one selected.
export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole | null }) => {
      const { error: delError } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delError) throw delError;
      if (role) {
        const { error: insError } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (insError) throw insError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-with-roles"] }),
  });
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: AppRole;
  technicianLevel: TechnicianLevel | null;
};

// Account creation needs the Admin API + service role key, which must never reach
// the browser — this goes through the admin-create-user edge function instead.
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: input });
      if (error) {
        // FunctionsHttpError only exposes a generic "non-2xx status code" message by
        // default — read the function's own JSON body for the real reason.
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // keep the generic message
          }
        }
        throw new Error(message);
      }
      return data as { userId: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-with-roles"] }),
  });
}
