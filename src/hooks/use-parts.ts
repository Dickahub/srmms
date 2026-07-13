import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Part = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  unit_cost: number;
  unit_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  location_id: string | null;
  current_holder_id: string | null;
  kept_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PartWithCustody = Part & {
  location: { id: string; name: string; code: string | null } | null;
  holder: { id: string; name: string } | null;
  keeper: { id: string; name: string } | null;
};

export type PartInput = Omit<Part, "id" | "created_at" | "updated_at">;

// `kept_by` isn't in the generated Database type yet (types.ts is only
// regenerated once this migration is applied against the live schema — see
// use-diagnostic-chat.ts for the same situation) — narrow casts at these call
// sites rather than hand-editing that generated file.
export function useParts(filters?: { search?: string; lowStockOnly?: boolean }) {
  return useQuery({
    queryKey: ["parts", filters ?? {}],
    queryFn: async () => {
      let q = supabase.from("parts").select("*").order("name", { ascending: true });
      if (filters?.search && filters.search.trim()) {
        const s = `%${filters.search.trim()}%`;
        q = q.or(`name.ilike.${s},sku.ilike.${s},category.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as unknown as Part[];
      if (filters?.lowStockOnly) rows = rows.filter((p) => p.quantity_on_hand <= p.reorder_level);
      return rows;
    },
  });
}

export function usePart(id: string | undefined) {
  return useQuery({
    queryKey: ["parts", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts")
        .select(
          "*, location:locations(id,name,code), holder:profiles!parts_current_holder_id_fkey(id,name)," +
            " keeper:profiles!parts_kept_by_fkey(id,name)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PartWithCustody | null;
    },
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PartInput> & { sku: string; name: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("parts")
        .insert({ ...input, created_by: auth.user?.id ?? null } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Part;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts"] }),
  });
}

export function useUpdatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PartInput> }) => {
      const { data, error } = await supabase.from("parts").update(patch as any).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Part;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["parts", "detail", v.id] });
    },
  });
}

export function useDeletePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parts").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts"] }),
  });
}

function invalidatePartCustody(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ["parts"] });
  qc.invalidateQueries({ queryKey: ["parts", "detail", id] });
  qc.invalidateQueries({ queryKey: ["part-location-history", id] });
  qc.invalidateQueries({ queryKey: ["held-items"] });
}

// Custody is tracked separately from stock — these never touch quantity_on_hand.
// Location and holder are mutually exclusive (parts_location_xor_holder CHECK);
// trg_parts_custody_history records the movement.
export function useRetrievePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("parts")
        .update({ current_holder_id: auth.user.id, location_id: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Part;
    },
    onSuccess: (d) => invalidatePartCustody(qc, d.id),
  });
}

export function usePlacePartLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, locationId }: { id: string; locationId: string }) => {
      const { data, error } = await supabase
        .from("parts")
        .update({ location_id: locationId, current_holder_id: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Part;
    },
    onSuccess: (d) => invalidatePartCustody(qc, d.id),
  });
}