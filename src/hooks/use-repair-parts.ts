import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RepairPart = {
  id: string;
  repair_id: string;
  part_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  part: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    quantity_on_hand: number;
  } | null;
};

export function useRepairParts(repairId: string | undefined) {
  return useQuery({
    queryKey: ["repair-parts", repairId],
    enabled: !!repairId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_parts")
        .select("*, part:parts(id,sku,name,unit,quantity_on_hand)")
        .eq("repair_id", repairId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RepairPart[];
    },
  });
}

export function useAddRepairPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { repair_id: string; part_id: string; quantity: number; unit_price: number; notes?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("repair_parts")
        .insert({ ...input, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["repair-parts", v.repair_id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

export function useRemoveRepairPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; repair_id: string }) => {
      const { error } = await supabase.from("repair_parts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["repair-parts", v.repair_id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}