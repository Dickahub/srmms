-- Delivering a repair that a technician currently holds needs to clear
-- current_holder_id and log a final custody event. That event is neither
-- 'retrieved' (nobody is taking custody) nor 'placed'/'moved' (no location is
-- involved) — the item is leaving custody entirely, handed to its owner. That's a
-- genuinely new kind of movement, so add 'delivered' to the allowed vocabulary
-- instead of force-fitting it into the existing three.
--
-- The repairs_location_xor_holder CHECK (Prompt 2) is unaffected by clearing
-- current_holder_id here: it only forbids location_id AND current_holder_id being
-- set at the same time. Going from (holder set, location null) to (holder null,
-- location null) trivially satisfies "not both set" — no constraint change needed
-- there, only the movement_type CHECK below needs widening.
ALTER TABLE public.repair_location_history DROP CONSTRAINT repair_location_history_movement_type_check;
ALTER TABLE public.repair_location_history
  ADD CONSTRAINT repair_location_history_movement_type_check
  CHECK (movement_type IN ('placed', 'moved', 'retrieved', 'delivered'));

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

  IF NEW.status = 'delivered' AND OLD.current_holder_id IS NOT NULL AND NEW.current_holder_id IS NULL THEN
    INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NULL, 'delivered', auth.uid());
  ELSIF NEW.current_holder_id IS DISTINCT FROM OLD.current_holder_id AND NEW.current_holder_id IS NOT NULL THEN
    INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NULL, 'retrieved', auth.uid());
  ELSIF NEW.location_id IS DISTINCT FROM OLD.location_id AND NEW.location_id IS NOT NULL THEN
    INSERT INTO public.repair_location_history (repair_id, location_id, movement_type, moved_by)
    VALUES (NEW.id, NEW.location_id, CASE WHEN OLD.location_id IS NULL THEN 'placed' ELSE 'moved' END, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;
