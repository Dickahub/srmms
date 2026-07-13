-- Guard against negative inventory:
-- 1) A hard CHECK as the last line of defense against any path that bypasses the trigger.
-- 2) tg_repair_parts_stock() now raises a clear, catchable exception ("Insufficient
--    stock for part X") before it would drive quantity_on_hand below zero, instead of
--    letting the update fail on the CHECK constraint with a generic Postgres message.

ALTER TABLE public.parts
  ADD CONSTRAINT parts_quantity_on_hand_non_negative CHECK (quantity_on_hand >= 0);

CREATE OR REPLACE FUNCTION public.tg_repair_parts_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_available integer;
  v_part_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT quantity_on_hand, name INTO v_available, v_part_name
      FROM public.parts WHERE id = NEW.part_id FOR UPDATE;
    IF v_available < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for part %', v_part_name
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.parts SET quantity_on_hand = quantity_on_hand - NEW.quantity WHERE id = NEW.part_id;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity WHERE id = OLD.part_id;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.part_id = NEW.part_id THEN
      IF NEW.quantity > OLD.quantity THEN
        SELECT quantity_on_hand, name INTO v_available, v_part_name
          FROM public.parts WHERE id = NEW.part_id FOR UPDATE;
        IF v_available < (NEW.quantity - OLD.quantity) THEN
          RAISE EXCEPTION 'Insufficient stock for part %', v_part_name
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity - NEW.quantity WHERE id = NEW.part_id;
    ELSE
      SELECT quantity_on_hand, name INTO v_available, v_part_name
        FROM public.parts WHERE id = NEW.part_id FOR UPDATE;
      IF v_available < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for part %', v_part_name
          USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity WHERE id = OLD.part_id;
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand - NEW.quantity WHERE id = NEW.part_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
