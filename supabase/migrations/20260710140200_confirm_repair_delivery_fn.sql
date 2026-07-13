-- Delivery must insert the deliveries row and flip the repair's status together —
-- two separate client-side calls (update then insert) could leave a repair marked
-- 'delivered' with no delivery record, or vice versa, if the second call failed.
-- A plpgsql function wraps both statements in one transaction: if either fails,
-- both roll back.
--
-- Deliberately NOT SECURITY DEFINER: it must run as the calling user so the
-- existing RLS policies on repairs (UPDATE) and deliveries (INSERT) still apply —
-- this function only bundles two ordinary statements together, it doesn't grant
-- any privilege the caller didn't already have. All the usual repairs triggers
-- still fire normally: trg_repairs_status_transition (delivered only from
-- completed), trg_repairs_custody_history (records the 'delivered' movement),
-- notify_repair, and audit_repairs.
CREATE OR REPLACE FUNCTION public.confirm_repair_delivery(
  _repair_id uuid,
  _picked_up_by_name text,
  _picked_up_by_phone text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries;
BEGIN
  UPDATE public.repairs
     SET status = 'delivered', current_holder_id = NULL
   WHERE id = _repair_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repair not found';
  END IF;

  INSERT INTO public.deliveries (repair_id, picked_up_by_name, picked_up_by_phone, handed_over_by, notes)
  VALUES (_repair_id, _picked_up_by_name, _picked_up_by_phone, auth.uid(), _notes)
  RETURNING * INTO v_delivery;

  RETURN v_delivery;
END;
$$;
