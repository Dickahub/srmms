import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepairStatus } from "@/hooks/use-repairs";

export type SearchMachineResult = {
  kind: "machine";
  id: string;
  serial_number: string | null;
  brand: string | null;
  model: string | null;
  machine_type: string | null;
  client: { id: string; name: string } | null;
};

export type SearchRepairResult = {
  kind: "repair";
  id: string;
  order_number: string;
  title: string;
  status: RepairStatus;
  machine_id: string | null;
  client: { id: string; name: string } | null;
};

// Matches serial_number OR order_number (partial, case-insensitive) — one search box,
// two independent ilike lookups, results shown as two grouped lists.
export function useGlobalSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["global-search", trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const like = `%${trimmed}%`;
      const [machinesRes, repairsRes] = await Promise.all([
        supabase
          .from("machines")
          .select("id, serial_number, brand, model, machine_type, client:clients(id,name)")
          .ilike("serial_number", like)
          .limit(8),
        supabase
          .from("repairs")
          .select("id, order_number, title, status, machine_id, client:clients(id,name)")
          .ilike("order_number", like)
          .limit(8),
      ]);
      if (machinesRes.error) throw machinesRes.error;
      if (repairsRes.error) throw repairsRes.error;
      return {
        machines: (machinesRes.data ?? []).map((m) => ({ kind: "machine" as const, ...m })) as SearchMachineResult[],
        repairs: (repairsRes.data ?? []).map((r) => ({ kind: "repair" as const, ...r })) as SearchRepairResult[],
      };
    },
  });
}
