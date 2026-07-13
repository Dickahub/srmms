import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StockEntry = {
  id: string;
  part_id: string;
  quantity: number;
  entered_by: string;
  kept_by: string | null;
  supplier: string | null;
  notes: string | null;
  entry_number: string;
  resulting_quantity_on_hand: number;
  created_at: string;
  enteredBy: { id: string; name: string } | null;
  keptBy: { id: string; name: string } | null;
};

// `stock_entries` isn't in the generated Database type yet (types.ts is only
// regenerated once this migration is applied against the live schema — see
// use-diagnostic-chat.ts for the same situation) — narrow `as any` casts at
// these call sites rather than hand-editing that generated file.
export function useStockEntries(partId: string | undefined) {
  return useQuery({
    queryKey: ["stock-entries", partId],
    enabled: !!partId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("stock_entries" as any) as any)
        .select("*, enteredBy:profiles!stock_entries_entered_by_fkey(id,name), keptBy:profiles!stock_entries_kept_by_fkey(id,name)")
        .eq("part_id", partId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StockEntry[];
    },
  });
}

// entered_by is never sent from here — the DB forces it to the caller
// (trg_stock_entries_before_insert) regardless of what's supplied. Incrementing
// parts.quantity_on_hand happens server-side too (trg_stock_entries_apply), in
// the same statement as this insert.
export function useCreateStockEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      part_id: string;
      quantity: number;
      kept_by?: string | null;
      supplier?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await (supabase.from("stock_entries" as any) as any)
        .insert({
          part_id: input.part_id,
          quantity: input.quantity,
          kept_by: input.kept_by ?? null,
          supplier: input.supplier ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as StockEntry;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["stock-entries", v.part_id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["parts", "detail", v.part_id] });
    },
  });
}
