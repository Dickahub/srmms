import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RepairStatus =
  | "pending"
  | "diagnosed"
  | "in_progress"
  | "awaiting_parts"
  | "completed"
  | "delivered"
  | "cancelled";
export type RepairPriority = "low" | "normal" | "high" | "urgent";

export const REPAIR_STATUSES: RepairStatus[] = [
  "pending",
  "diagnosed",
  "in_progress",
  "awaiting_parts",
  "completed",
  "delivered",
  "cancelled",
];
export const REPAIR_PRIORITIES: RepairPriority[] = ["low", "normal", "high", "urgent"];

export const STATUS_LABEL: Record<RepairStatus, string> = {
  pending: "Pending",
  diagnosed: "Diagnosed",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Mirrors trg_repairs_status_transition (DB-enforced): pending -> diagnosed ->
// in_progress -> awaiting_parts -> completed -> delivered, cancellable from any
// non-terminal status. delivered and cancelled are terminal (no further moves).
export const NEXT_STATUSES: Record<RepairStatus, RepairStatus[]> = {
  pending: ["diagnosed", "cancelled"],
  diagnosed: ["in_progress", "cancelled"],
  in_progress: ["awaiting_parts", "cancelled"],
  awaiting_parts: ["completed", "cancelled"],
  completed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

// Statuses that represent work still in flight (used for "active repairs" counts
// everywhere: dashboard cards, workload chart, aging/overdue check).
export const TERMINAL_STATUSES: RepairStatus[] = ["completed", "delivered", "cancelled"];
export function isActiveStatus(status: RepairStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

export type AgingLevel = "none" | "amber" | "red";

// Overdue = no update in a while on a still-open repair. Urgent-priority repairs use
// half the thresholds (7/14 days -> 3.5/7) since they need attention sooner.
export function getRepairAging(repair: { status: RepairStatus; priority: RepairPriority; updated_at: string }): {
  level: AgingLevel;
  days: number;
} {
  if (!isActiveStatus(repair.status)) return { level: "none", days: 0 };
  const days = (Date.now() - new Date(repair.updated_at).getTime()) / 86_400_000;
  const isUrgent = repair.priority === "urgent";
  const redThreshold = isUrgent ? 7 : 14;
  const amberThreshold = isUrgent ? 3.5 : 7;
  let level: AgingLevel = "none";
  if (days > redThreshold) level = "red";
  else if (days > amberThreshold) level = "amber";
  return { level, days };
}

export const PRIORITY_LABEL: Record<RepairPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export type Repair = {
  id: string;
  order_number: string;
  client_id: string;
  machine_id: string | null;
  title: string;
  description: string | null;
  status: RepairStatus;
  priority: RepairPriority;
  assigned_to: string | null;
  intake_date: string;
  due_date: string | null;
  completed_at: string | null;
  diagnosis: string | null;
  resolution: string | null;
  cost: number | null;
  location_id: string | null;
  current_holder_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type RepairWithRelations = Repair & {
  client: { id: string; name: string } | null;
  machine: { id: string; brand: string | null; model: string | null; serial_number: string | null } | null;
};

export type RepairWithCustody = Omit<RepairWithRelations, "machine"> & {
  // useRepair()'s machine join additionally selects machine_type (the list query
  // in useRepairs() doesn't), so the detail-page shape needs its own machine type.
  machine: { id: string; brand: string | null; model: string | null; serial_number: string | null; machine_type: string | null } | null;
  location: { id: string; name: string; code: string | null } | null;
  holder: { id: string; name: string } | null;
};

export type RepairInput = Omit<Repair, "id" | "order_number" | "is_archived" | "created_at" | "updated_at">;

// `is_archived` isn't in the generated Database type yet (types.ts is only
// regenerated once this migration is applied against the live schema — see
// use-diagnostic-chat.ts for the same situation) — narrow `as any` cast just
// for this filter/patch rather than hand-editing that generated file.
export function useRepairs(filters?: { status?: RepairStatus | "all"; search?: string; includeArchived?: boolean }) {
  return useQuery({
    queryKey: ["repairs", filters ?? {}],
    queryFn: async () => {
      let q = supabase
        .from("repairs")
        .select("*, client:clients(id,name), machine:machines(id,brand,model,serial_number)")
        .order("created_at", { ascending: false });
      if (!filters?.includeArchived) q = (q as any).eq("is_archived", false);
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.search && filters.search.trim()) {
        const s = `%${filters.search.trim()}%`;
        q = q.or(`order_number.ilike.${s},title.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RepairWithRelations[];
    },
  });
}

export function useRepair(id: string | undefined) {
  return useQuery({
    queryKey: ["repairs", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repairs")
        .select(
          "*, client:clients(id,name,phone,email), machine:machines(id,brand,model,serial_number,machine_type)," +
            " location:locations(id,name,code), holder:profiles!repairs_current_holder_id_fkey(id,name)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as (RepairWithCustody & { client: { id: string; name: string; phone: string | null; email: string | null } | null }) | null;
    },
  });
}

export function useCreateRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RepairInput> & { client_id: string; title: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("repairs")
        .insert({ ...input, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Repair;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });
}

export function useUpdateRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RepairInput> }) => {
      const finalPatch = { ...patch };
      if (patch.status === "completed" && !patch.completed_at) {
        finalPatch.completed_at = new Date().toISOString();
      }
      const { data, error } = await supabase.from("repairs").update(finalPatch).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Repair;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["repairs", "detail", v.id] });
      qc.invalidateQueries({ queryKey: ["notifications-log"] });
      // Email dispatch is handled server-side now (trg_send_email_notification via
      // pg_net, see the notifications_pg_net_dispatch migration) — no client
      // invoke needed here anymore; tg_notify_repair's insert is what fires it.
    },
  });
}

export function useDeleteRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("repairs").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });
}

export function useSetRepairArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isArchived }: { id: string; isArchived: boolean }) => {
      const { error } = await supabase.from("repairs").update({ is_archived: isArchived } as any).eq("id", id);
      if (error) throw error;
      return { id, isArchived };
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["repairs", "detail", v.id] });
      qc.invalidateQueries({ queryKey: ["dashboard-repairs"] });
    },
  });
}

function invalidateCustody(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ["repairs"] });
  qc.invalidateQueries({ queryKey: ["repairs", "detail", id] });
  qc.invalidateQueries({ queryKey: ["repair-location-history", id] });
  qc.invalidateQueries({ queryKey: ["held-items"] });
}

// Custody and location are mutually exclusive (repairs_location_xor_holder CHECK);
// trg_repairs_custody_history records the movement, trg_repairs_custody_guard blocks
// retrieving a delivered repair.
export function useRetrieveRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("repairs")
        .update({ current_holder_id: auth.user.id, location_id: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Repair;
    },
    onSuccess: (d) => invalidateCustody(qc, d.id),
  });
}

export function usePlaceRepairLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, locationId }: { id: string; locationId: string }) => {
      const { data, error } = await supabase
        .from("repairs")
        .update({ location_id: locationId, current_holder_id: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Repair;
    },
    onSuccess: (d) => invalidateCustody(qc, d.id),
  });
}