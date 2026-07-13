import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Client = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientInput = Omit<Client, "id" | "is_active" | "created_at" | "updated_at">;

// `is_active` isn't in the generated Database type yet (types.ts is only
// regenerated once this migration is applied against the live schema — see
// use-diagnostic-chat.ts for the same situation) — narrow `as any` cast just
// for this filter/patch rather than hand-editing that generated file.
export function useClients(search?: string, options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false;
  return useQuery({
    queryKey: ["clients", search ?? "", includeArchived],
    queryFn: async () => {
      let q = supabase.from("clients").select("*").order("name");
      if (!includeArchived) q = (q as any).eq("is_active", true);
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s},contact_person.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as Client | null;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ClientInput> & { name: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...input, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ClientInput> }) => {
      const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Client;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", "detail", v.id] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// Counts repairs linked to this client (direct client_id — kept in sync with
// machine_id -> machines.client_id by trg_repairs_sync_client_from_machine,
// so this single count is authoritative). Used to gate hard delete in the UI;
// the real enforcement is the trg_clients_prevent_delete_with_repairs trigger.
export function useClientRepairCount(clientId: string | undefined) {
  return useQuery({
    queryKey: ["clients", "repair-count", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("repairs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useSetClientActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("clients").update({ is_active: isActive } as any).eq("id", id);
      if (error) throw error;
      return { id, isActive };
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", "detail", v.id] });
    },
  });
}

export function friendlyClientError(e: { message?: string; code?: string } | null | undefined): string {
  const msg = e?.message ?? "";
  if (msg.includes("has repair history")) return msg;
  if (msg.includes("Only an Admin can archive")) return "Only an Admin can archive or reactivate a client.";
  if (e?.code === "23503" || msg.includes("repairs_client_id_fkey")) {
    return "This client has repair history — use Archive instead.";
  }
  return msg || "Something went wrong.";
}