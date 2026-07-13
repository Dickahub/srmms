-- Storage locations are a front-desk/admin concern, not a technician one: creating,
-- renaming or removing a box is now Admin/Receptionist only. Technician keeps SELECT
-- (still needs to see boxes to retrieve/place items, which touches repairs/parts —
-- not this table — so that flow is unaffected by this change).
DROP POLICY IF EXISTS "locations_insert_admin_tech" ON public.locations;
DROP POLICY IF EXISTS "locations_update_admin_tech" ON public.locations;
DROP POLICY IF EXISTS "locations_delete_admin" ON public.locations;

CREATE POLICY "locations_insert_admin_reception" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
CREATE POLICY "locations_update_admin_reception" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
CREATE POLICY "locations_delete_admin_reception" ON public.locations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
