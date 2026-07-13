-- Archive (soft-delete-style) for repairs, following the same pattern as
-- clients' is_active: archived rows stay fully intact (no data removed, no
-- RLS lockout) and remain visible via machine history / global search, but
-- are excluded from the default repairs list and dashboard by query filters,
-- with a "Show archived" toggle. Archiving/unarchiving is a plain UPDATE, so
-- it's picked up by the existing audit_repairs trigger automatically.
ALTER TABLE public.repairs ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX repairs_is_archived_idx ON public.repairs (is_archived);

-- Admin-only, and only a delivered/cancelled repair may be archived (active
-- work must not disappear from the default list). Unarchiving has no status
-- restriction. Mirrors trg_clients_archive_guard.
CREATE OR REPLACE FUNCTION public.tg_repairs_archive_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'Admin') THEN
    RAISE EXCEPTION 'Only an Admin can archive or unarchive a repair';
  END IF;

  IF NEW.is_archived AND NOT OLD.is_archived AND NEW.status NOT IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Only delivered or cancelled repairs can be archived';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_archive_guard
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  WHEN (OLD.is_archived IS DISTINCT FROM NEW.is_archived)
  EXECUTE FUNCTION public.tg_repairs_archive_guard();

-- Archived repairs are read-only: any update other than unarchiving itself is
-- rejected — this covers metadata edits, status changes, assignment, and
-- custody retrieve/place in one place, since they all go through a plain
-- UPDATE on this table.
CREATE OR REPLACE FUNCTION public.tg_repairs_archived_readonly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_archived AND NEW.is_archived THEN
    RAISE EXCEPTION 'This repair is archived and cannot be edited — unarchive it first';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_archived_readonly
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  WHEN (OLD.is_archived = true)
  EXECUTE FUNCTION public.tg_repairs_archived_readonly();
