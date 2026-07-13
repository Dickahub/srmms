import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Location = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type LocationInput = { name: string; code?: string | null; description?: string | null };

export function useLocations(search?: string) {
  return useQuery({
    queryKey: ["locations", search ?? ""],
    queryFn: async () => {
      let q = supabase.from("locations").select("*").order("name");
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`name.ilike.${s},code.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: ["locations", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Location | null;
    },
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LocationInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("locations")
        .insert({
          name: input.name.trim(),
          code: input.code?.trim() || null,
          description: input.description?.trim() || null,
          created_by: auth.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LocationInput> }) => {
      const { data, error } = await supabase.from("locations").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["locations", "detail", v.id] });
    },
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}