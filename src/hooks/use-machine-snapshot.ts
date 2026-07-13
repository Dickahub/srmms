import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUsersWithRoles, technicianDisplayName } from "@/hooks/use-users";
import type { RepairPriority, RepairStatus } from "@/hooks/use-repairs";
import type { Machine } from "@/hooks/use-machines";

export type SnapshotRepair = {
  id: string;
  order_number: string;
  title: string;
  status: RepairStatus;
  priority: RepairPriority;
  assigned_to: string | null;
  created_at: string;
  location: { id: string; name: string; code: string | null } | null;
  holder: { id: string; name: string } | null;
};

export type MachineSnapshot = {
  machine: Machine & { client: { id: string; name: string } | null };
  /** The searched-for repair if selection came from a repair match, else the most recent one. */
  currentRepair: (SnapshotRepair & { technicianName: string | null }) | null;
  /** Full history, newest first. */
  repairs: (SnapshotRepair & { technicianName: string | null })[];
};

function useMachineSnapshotRaw(machineId: string | undefined) {
  return useQuery({
    queryKey: ["machine-snapshot", machineId],
    enabled: !!machineId,
    queryFn: async () => {
      const [machineRes, repairsRes] = await Promise.all([
        supabase.from("machines").select("*, client:clients(id,name)").eq("id", machineId!).maybeSingle(),
        supabase
          .from("repairs")
          .select(
            "id, order_number, title, status, priority, assigned_to, created_at, location:locations(id,name,code), holder:profiles!repairs_current_holder_id_fkey(id,name)",
          )
          .eq("machine_id", machineId!)
          .order("created_at", { ascending: false }),
      ]);
      if (machineRes.error) throw machineRes.error;
      if (repairsRes.error) throw repairsRes.error;
      return {
        machine: machineRes.data as (Machine & { client: { id: string; name: string } | null }) | null,
        repairs: (repairsRes.data ?? []) as SnapshotRepair[],
      };
    },
  });
}

export function useMachineSnapshot(machineId: string | undefined, pinnedRepairId?: string): {
  data: MachineSnapshot | null;
  isLoading: boolean;
} {
  const { data, isLoading: rawLoading } = useMachineSnapshotRaw(machineId);
  const { data: users, isLoading: usersLoading } = useUsersWithRoles();

  const snapshot = useMemo<MachineSnapshot | null>(() => {
    if (!data?.machine) return null;
    const userMap = new Map((users ?? []).map((u) => [u.id, technicianDisplayName(u)]));
    const repairs = data.repairs.map((r) => ({
      ...r,
      technicianName: r.assigned_to ? (userMap.get(r.assigned_to) ?? "Unknown") : null,
    }));
    const current = pinnedRepairId ? repairs.find((r) => r.id === pinnedRepairId) : repairs[0];
    return {
      machine: data.machine,
      currentRepair: current ?? null,
      repairs,
    };
  }, [data, users, pinnedRepairId]);

  return { data: snapshot, isLoading: rawLoading || usersLoading };
}
