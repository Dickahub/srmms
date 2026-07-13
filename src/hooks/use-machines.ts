import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepairStatus } from "@/hooks/use-repairs";

export type Machine = {
  id: string;
  client_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  machine_type: string | null;
  year: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MachineInput = Omit<Machine, "id" | "created_at" | "updated_at">;

export type MachineSerialOwner = {
  id: string;
  client_id: string;
  client: { name: string } | null;
};

// Pre-check used by MachineForm to surface a friendly duplicate-serial message
// before hitting the machines_serial_unique constraint. excludeId lets edit mode
// ignore the machine's own row.
export async function findMachineBySerial(serial: string, excludeId?: string): Promise<MachineSerialOwner | null> {
  let q = supabase.from("machines").select("id, client_id, client:clients(name)").eq("serial_number", serial);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data as MachineSerialOwner | null;
}

// Fallback for the rare race where two submits land between MachineForm's
// pre-check and the insert/update — maps the raw machines_serial_unique
// violation to the same friendly wording as the pre-check.
export function friendlyMachineError(e: { message?: string; code?: string } | null | undefined): string {
  const msg = e?.message ?? "";
  if (e?.code === "23505" && msg.includes("machines_serial_unique")) {
    return "This serial number is already registered to another machine.";
  }
  return msg || "Something went wrong.";
}

export type MachineIntakeRepair = {
  id: string;
  order_number: string;
  title: string;
  status: RepairStatus;
  diagnosis: string | null;
  intake_date: string;
  created_at: string;
};

export type MachineIntakeMemory = {
  machine: Machine & { client: { id: string; name: string } | null };
  repairCount: number;
  lastRepair: MachineIntakeRepair | null;
  repairs: MachineIntakeRepair[];
};

// Powers the intake-memory panel in MachineForm: once findMachineBySerial finds a
// match, this fetches what to show about it (owning client, repair history) rather
// than duplicating the existence check itself.
export async function getMachineIntakeMemory(machineId: string): Promise<MachineIntakeMemory> {
  const [machineRes, repairsRes] = await Promise.all([
    supabase.from("machines").select("*, client:clients(id,name)").eq("id", machineId).single(),
    supabase
      .from("repairs")
      .select("id, order_number, title, status, diagnosis, intake_date, created_at")
      .eq("machine_id", machineId)
      .order("created_at", { ascending: false }),
  ]);
  if (machineRes.error) throw machineRes.error;
  if (repairsRes.error) throw repairsRes.error;
  const repairs = (repairsRes.data ?? []) as MachineIntakeRepair[];
  return {
    machine: machineRes.data as Machine & { client: { id: string; name: string } | null },
    repairCount: repairs.length,
    lastRepair: repairs[0] ?? null,
    repairs,
  };
}

export function useClientMachines(clientId: string | undefined) {
  return useQuery({
    queryKey: ["machines", "by-client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .eq("client_id", clientId!)
        .order("brand");
      if (error) throw error;
      return (data ?? []) as Machine[];
    },
  });
}

export function useMachine(id: string | undefined) {
  return useQuery({
    queryKey: ["machines", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("*, client:clients(id,name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as (Machine & { client: { id: string; name: string } | null }) | null;
    },
  });
}

export function useCreateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MachineInput> & { client_id: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("machines")
        .insert({ ...input, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Machine;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["machines", "by-client", d.client_id] });
    },
  });
}

export function useUpdateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MachineInput> }) => {
      const { data, error } = await supabase.from("machines").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Machine;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["machines", "detail", d.id] });
      qc.invalidateQueries({ queryKey: ["machines", "by-client", d.client_id] });
    },
  });
}

export function useDeleteMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase.from("machines").delete().eq("id", id);
      if (error) throw error;
      return { id, clientId };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["machines", "by-client", r.clientId] });
    },
  });
}