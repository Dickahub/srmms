-- "Kept by" is the responsible custodian of a part in stock — distinct from
-- current_holder_id, which means "temporarily checked out to a technician"
-- via the custody retrieve/place flow. A plain, ordinary field: whoever can
-- already update a part (Admin/Receptionist, parts_update_staff policy) can
-- set it — no extra guard needed. Existing audit_parts trigger picks up
-- changes to it automatically, same as every other column.
ALTER TABLE public.parts ADD COLUMN kept_by uuid REFERENCES public.profiles(id);
CREATE INDEX parts_kept_by_idx ON public.parts (kept_by);
