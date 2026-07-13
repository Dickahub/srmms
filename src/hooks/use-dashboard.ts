import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParts } from "@/hooks/use-parts";
import { useHeldItems } from "@/hooks/use-location-history";
import { useUsersWithRoles, technicianDisplayName } from "@/hooks/use-users";
import {
  isActiveStatus, getRepairAging, REPAIR_STATUSES, STATUS_LABEL,
  type RepairStatus, type RepairPriority,
} from "@/hooks/use-repairs";

export type DashboardRepairRow = {
  id: string;
  order_number: string;
  title: string;
  status: RepairStatus;
  priority: RepairPriority;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  machine: { machine_type: string | null } | null;
};

function useDashboardRepairsRaw() {
  return useQuery({
    queryKey: ["dashboard-repairs"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("repairs")
        .select(
          "id, order_number, title, status, priority, assigned_to, created_at, updated_at, completed_at, machine:machines(machine_type)",
        ) as any)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardRepairRow[];
    },
  });
}

export type DashboardData = {
  activeCount: number;
  awaitingPartsCount: number;
  lowStockCount: number;
  heldCount: number;
  perMonth: { month: string; count: number }[];
  byStatus: { status: RepairStatus; label: string; count: number }[];
  topMachineTypes: { type: string; count: number }[];
  technicianWorkload: { name: string; count: number }[];
  /** Average days from created_at to completion, across completed/delivered repairs. */
  avgDurationDays: number | null;
  overdueAmberCount: number;
  overdueRedCount: number;
  /** All repairs with an in-flight status (not completed/delivered/cancelled). */
  activeRepairs: DashboardRepairRow[];
  isLoading: boolean;
};

export function useDashboardData(): DashboardData {
  const { data: repairs, isLoading: repairsLoading } = useDashboardRepairsRaw();
  const { data: profiles, isLoading: profilesLoading } = useUsersWithRoles();
  const { data: parts, isLoading: partsLoading } = useParts();
  const { data: held, isLoading: heldLoading } = useHeldItems();

  return useMemo(() => {
    const rows = repairs ?? [];
    // "Jean K. — Level 2" everywhere a technician's name is shown, matching the
    // assignment dropdown and /users list.
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, technicianDisplayName(p)]));

    const activeRepairs = rows.filter((r) => isActiveStatus(r.status));
    const awaitingPartsCount = rows.filter((r) => r.status === "awaiting_parts").length;
    const lowStockCount = (parts ?? []).filter((p) => p.quantity_on_hand <= p.reorder_level).length;
    const heldCount = (held?.repairs.length ?? 0) + (held?.parts.length ?? 0);

    // Repairs per month, last 6 months (this month included), from created_at.
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }) };
    });
    const perMonthCounts = new Map(months.map((m) => [m.key, 0]));
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (perMonthCounts.has(key)) perMonthCounts.set(key, (perMonthCounts.get(key) ?? 0) + 1);
    }
    const perMonth = months.map((m) => ({ month: m.label, count: perMonthCounts.get(m.key) ?? 0 }));

    // Repairs by status — current distribution across every repair, not just active ones.
    const statusCounts = new Map<RepairStatus, number>();
    for (const r of rows) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
    const byStatus = REPAIR_STATUSES.map((s) => ({ status: s, label: STATUS_LABEL[s], count: statusCounts.get(s) ?? 0 }));

    // Most common machine types, top 5.
    const typeCounts = new Map<string, number>();
    for (const r of rows) {
      const t = r.machine?.machine_type?.trim();
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const topMachineTypes = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Technician workload: active repairs per assignee (including an "Unassigned" bucket).
    const workloadCounts = new Map<string, number>();
    for (const r of activeRepairs) {
      const key = r.assigned_to ?? "unassigned";
      workloadCounts.set(key, (workloadCounts.get(key) ?? 0) + 1);
    }
    const technicianWorkload = Array.from(workloadCounts.entries())
      .map(([id, count]) => ({ name: id === "unassigned" ? "Unassigned" : (profileMap.get(id) ?? "Unknown"), count }))
      .sort((a, b) => b.count - a.count);

    // Average repair duration: completed/delivered repairs only. completed_at is set
    // automatically when a repair reaches "completed" (see useUpdateRepair), but for
    // any row where it's still null we approximate with updated_at instead of
    // dropping the repair from the average entirely.
    const durations = rows
      .filter((r) => r.status === "completed" || r.status === "delivered")
      .map((r) => {
        const end = new Date(r.completed_at ?? r.updated_at).getTime();
        const start = new Date(r.created_at).getTime();
        return (end - start) / 86_400_000;
      })
      .filter((d) => Number.isFinite(d) && d >= 0);
    const avgDurationDays = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    // Overdue: no update in a while on a still-open repair (see getRepairAging).
    let overdueAmberCount = 0;
    let overdueRedCount = 0;
    for (const r of rows) {
      const { level } = getRepairAging(r);
      if (level === "amber") overdueAmberCount++;
      else if (level === "red") overdueRedCount++;
    }

    return {
      activeCount: activeRepairs.length,
      awaitingPartsCount,
      lowStockCount,
      heldCount,
      perMonth,
      byStatus,
      topMachineTypes,
      technicianWorkload,
      avgDurationDays,
      overdueAmberCount,
      overdueRedCount,
      activeRepairs,
      isLoading: repairsLoading || profilesLoading || partsLoading || heldLoading,
    };
  }, [repairs, profiles, parts, held, repairsLoading, profilesLoading, partsLoading, heldLoading]);
}
