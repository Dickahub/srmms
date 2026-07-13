import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RepairLog = {
  id: string;
  repair_id: string;
  action: string;
  result: string | null;
  technician_id: string;
  time_spent_minutes: number | null;
  created_at: string;
  technician: { id: string; name: string } | null;
};

export type RepairLogPartInput = { part_id: string; quantity: number; unit_price: number };

export function useRepairLogs(repairId: string | undefined) {
  return useQuery({
    queryKey: ["repair-logs", repairId],
    enabled: !!repairId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_logs")
        .select("*, technician:profiles(id,name)")
        .eq("repair_id", repairId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RepairLog[];
    },
  });
}

// Inserts the log entry, then any attached parts as their own repair_parts rows (the
// existing tg_repair_parts_stock trigger still handles the stock decrement/guard).
// Each insert is its own request — if a part attachment fails (e.g. insufficient
// stock) the log entry itself still stands; failures are returned for the caller to
// surface, matching how RepairPartsSection's single "add part" calls already work.
export function useAddRepairLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      repair_id: string;
      action: string;
      result?: string | null;
      time_spent_minutes?: number | null;
      parts?: RepairLogPartInput[];
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data: log, error: logError } = await supabase
        .from("repair_logs")
        .insert({
          repair_id: input.repair_id,
          action: input.action,
          result: input.result ?? null,
          time_spent_minutes: input.time_spent_minutes ?? null,
          technician_id: auth.user.id,
        })
        .select()
        .single();
      if (logError) throw logError;

      const partErrors: { partId: string; message: string }[] = [];
      for (const p of input.parts ?? []) {
        const { error: partError } = await supabase.from("repair_parts").insert({
          repair_id: input.repair_id,
          part_id: p.part_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          created_by: auth.user.id,
        });
        if (partError) partErrors.push({ partId: p.part_id, message: partError.message });
      }

      return { log, partErrors };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["repair-logs", v.repair_id] });
      qc.invalidateQueries({ queryKey: ["repair-parts", v.repair_id] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}
