import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepairStatus } from "@/hooks/use-repairs";

export type MovementType = "placed" | "moved" | "retrieved";

export type LocationHistoryEntry = {
  id: string;
  location_id: string | null;
  movement_type: MovementType;
  moved_by: string;
  moved_at: string;
  location: { id: string; name: string; code: string | null } | null;
  mover: { id: string; name: string } | null;
};

export function useRepairLocationHistory(repairId: string | undefined) {
  return useQuery({
    queryKey: ["repair-location-history", repairId],
    enabled: !!repairId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_location_history")
        .select("*, location:locations(id,name,code), mover:profiles(id,name)")
        .eq("repair_id", repairId!)
        .order("moved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LocationHistoryEntry[];
    },
  });
}

export function usePartLocationHistory(partId: string | undefined) {
  return useQuery({
    queryKey: ["part-location-history", partId],
    enabled: !!partId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("part_location_history")
        .select("*, location:locations(id,name,code), mover:profiles(id,name)")
        .eq("part_id", partId!)
        .order("moved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LocationHistoryEntry[];
    },
  });
}

export type LocationContentPart = { id: string; sku: string; name: string; quantity_on_hand: number };
export type LocationContentRepair = {
  id: string;
  order_number: string;
  title: string;
  status: RepairStatus;
  machine: { brand: string | null; model: string | null; machine_type: string | null } | null;
};

// Powers the location detail page's "box contents" view: everything currently
// placed in this location (location_id set, not held) across parts and repairs.
export function useLocationContents(locationId: string | undefined) {
  return useQuery({
    queryKey: ["location-contents", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const [partsRes, repairsRes] = await Promise.all([
        supabase
          .from("parts")
          .select("id, sku, name, quantity_on_hand")
          .eq("location_id", locationId!)
          .order("name"),
        supabase
          .from("repairs")
          .select("id, order_number, title, status, machine:machines(brand,model,machine_type)")
          .eq("location_id", locationId!)
          .order("order_number"),
      ]);
      if (partsRes.error) throw partsRes.error;
      if (repairsRes.error) throw repairsRes.error;
      return {
        parts: (partsRes.data ?? []) as LocationContentPart[],
        repairs: (repairsRes.data ?? []) as LocationContentRepair[],
      };
    },
  });
}

export type HeldRepair = { id: string; order_number: string; title: string; holder: { id: string; name: string } | null };
export type HeldPart = { id: string; sku: string; name: string; holder: { id: string; name: string } | null };

// Powers the Locations page's "Held by technician" view: everything currently
// checked out (current_holder_id set) across both repairs and parts, grouped by
// holder client-side.
export function useHeldItems() {
  return useQuery({
    queryKey: ["held-items"],
    queryFn: async () => {
      const [repairsRes, partsRes] = await Promise.all([
        supabase
          .from("repairs")
          .select("id, order_number, title, holder:profiles!repairs_current_holder_id_fkey(id,name)")
          .not("current_holder_id", "is", null),
        supabase
          .from("parts")
          .select("id, sku, name, holder:profiles!parts_current_holder_id_fkey(id,name)")
          .not("current_holder_id", "is", null),
      ]);
      if (repairsRes.error) throw repairsRes.error;
      if (partsRes.error) throw partsRes.error;
      return {
        repairs: (repairsRes.data ?? []) as HeldRepair[],
        parts: (partsRes.data ?? []) as HeldPart[],
      };
    },
  });
}
