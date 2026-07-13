-- Custody tracking: an item (repair or part) is EITHER sitting in a location
-- (location_id set) OR currently held by someone (current_holder_id set), never
-- both. History tables record the full custody chain; writes happen only via
-- SECURITY DEFINER triggers (added in the next migration), same pattern as audit_log.

CREATE TABLE public.repair_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id),
  movement_type text NOT NULL CHECK (movement_type IN ('placed', 'moved', 'retrieved')),
  moved_by uuid NOT NULL REFERENCES public.profiles(id),
  moved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repair_location_history_repair_idx ON public.repair_location_history (repair_id, moved_at);
CREATE INDEX repair_location_history_moved_by_idx ON public.repair_location_history (moved_by);

GRANT SELECT, INSERT ON public.repair_location_history TO authenticated;
GRANT ALL ON public.repair_location_history TO service_role;
ALTER TABLE public.repair_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "repair_location_history_select_auth" ON public.repair_location_history
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies: writes happen through a SECURITY DEFINER trigger.

CREATE TABLE public.part_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id),
  movement_type text NOT NULL CHECK (movement_type IN ('placed', 'moved', 'retrieved')),
  moved_by uuid NOT NULL REFERENCES public.profiles(id),
  moved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX part_location_history_part_idx ON public.part_location_history (part_id, moved_at);
CREATE INDEX part_location_history_moved_by_idx ON public.part_location_history (moved_by);

GRANT SELECT, INSERT ON public.part_location_history TO authenticated;
GRANT ALL ON public.part_location_history TO service_role;
ALTER TABLE public.part_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part_location_history_select_auth" ON public.part_location_history
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies: writes happen through a SECURITY DEFINER trigger.

-- Custody columns + the location-XOR-holder invariant.
ALTER TABLE public.repairs ADD COLUMN current_holder_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.parts   ADD COLUMN current_holder_id uuid REFERENCES public.profiles(id);

CREATE INDEX repairs_current_holder_idx ON public.repairs (current_holder_id);
CREATE INDEX parts_current_holder_idx   ON public.parts (current_holder_id);

ALTER TABLE public.repairs
  ADD CONSTRAINT repairs_location_xor_holder
  CHECK (NOT (location_id IS NOT NULL AND current_holder_id IS NOT NULL));

ALTER TABLE public.parts
  ADD CONSTRAINT parts_location_xor_holder
  CHECK (NOT (location_id IS NOT NULL AND current_holder_id IS NOT NULL));

-- Retrieving/placing a part means updating parts.current_holder_id/location_id, which
-- the pre-existing "parts_update_staff" policy didn't grant to Technician (only
-- Admin/Receptionist). RLS is row-level, not column-level, so — same as repairs,
-- which already allows Technician to update the whole row — widen part updates to
-- Technician too rather than bolting on a column-restriction trigger.
DROP POLICY IF EXISTS "parts_update_staff" ON public.parts;
CREATE POLICY "parts_update_staff" ON public.parts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  );
