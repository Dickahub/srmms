import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
};

export function useAuditLog(filters?: { entityType?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: ["audit-log", filters ?? {}],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters?.limit ?? 200);
      if (filters?.entityType && filters.entityType !== "all") {
        q = q.eq("entity_type", filters.entityType);
      }
      if (filters?.search && filters.search.trim()) {
        const s = `%${filters.search.trim()}%`;
        q = q.or(`entity_label.ilike.${s},actor_email.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });
}