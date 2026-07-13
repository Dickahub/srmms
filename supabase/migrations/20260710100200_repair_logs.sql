-- Append-only technician action log. repairs.diagnosis/resolution stay as static
-- summary fields (they map to the paper form); this is the chronological record of
-- what was actually done, by whom, and for how long.
CREATE TABLE public.repair_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  action text NOT NULL,
  result text,
  technician_id uuid NOT NULL REFERENCES public.profiles(id),
  time_spent_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repair_logs_repair_idx ON public.repair_logs (repair_id, created_at);
CREATE INDEX repair_logs_technician_idx ON public.repair_logs (technician_id);

GRANT SELECT, INSERT ON public.repair_logs TO authenticated;
GRANT ALL ON public.repair_logs TO service_role;

ALTER TABLE public.repair_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "repair_logs_select_auth" ON public.repair_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "repair_logs_insert_tech_admin" ON public.repair_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'));

-- No UPDATE/DELETE policies: repair_logs is append-only.
