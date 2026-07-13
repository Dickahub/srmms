-- Auto-write the custody chain whenever location_id/current_holder_id change.
-- 'retrieved' when a holder becomes set, 'placed' when a location becomes set from
-- nothing, 'moved' when the location changes between two locations. Also covers
-- INSERT, so a repair/part created with an initial location/holder gets a first
-- history entry instead of showing no history until the next change.

CREATE OR REPLACE FUNCTION public.tg_repairs_custody_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_holder_id IS NOT NULL THEN
      INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
      VALUES (NEW.id, NULL, 'retrieved', auth.uid());
    ELSIF NEW.location_id IS NOT NULL THEN
      INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
      VALUES (NEW.id, NEW.location_id, 'placed', auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.current_holder_id IS DISTINCT FROM OLD.current_holder_id AND NEW.current_holder_id IS NOT NULL THEN
    INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NULL, 'retrieved', auth.uid());
  ELSIF NEW.location_id IS DISTINCT FROM OLD.location_id AND NEW.location_id IS NOT NULL THEN
    INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NEW.location_id, CASE WHEN OLD.location_id IS NULL THEN 'placed' ELSE 'moved' END, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_custody_history
  AFTER INSERT OR UPDATE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_repairs_custody_history();

CREATE OR REPLACE FUNCTION public.tg_parts_custody_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_holder_id IS NOT NULL THEN
      INSERT INTO public.part_location_history (part_id, location_id, movement_type, moved_by)
      VALUES (NEW.id, NULL, 'retrieved', auth.uid());
    ELSIF NEW.location_id IS NOT NULL THEN
      INSERT INTO public.part_location_history (part_id, location_id, movement_type, moved_by)
      VALUES (NEW.id, NEW.location_id, 'placed', auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.current_holder_id IS DISTINCT FROM OLD.current_holder_id AND NEW.current_holder_id IS NOT NULL THEN
    INSERT INTO public.part_location_history (part_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NULL, 'retrieved', auth.uid());
  ELSIF NEW.location_id IS DISTINCT FROM OLD.location_id AND NEW.location_id IS NOT NULL THEN
    INSERT INTO public.part_location_history (part_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NEW.location_id, CASE WHEN OLD.location_id IS NULL THEN 'placed' ELSE 'moved' END, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_parts_custody_history
  AFTER INSERT OR UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_parts_custody_history();

-- A delivered repair is done and gone; it cannot be "retrieved" (custody claimed) again.
CREATE OR REPLACE FUNCTION public.tg_repairs_custody_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.current_holder_id IS DISTINCT FROM OLD.current_holder_id
     AND NEW.current_holder_id IS NOT NULL
     AND NEW.status = 'delivered' THEN
    RAISE EXCEPTION 'Cannot retrieve a delivered repair';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_repairs_custody_guard
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_repairs_custody_guard();

REVOKE EXECUTE ON FUNCTION public.tg_repairs_custody_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_parts_custody_history()   FROM PUBLIC, anon, authenticated;
