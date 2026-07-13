-- Human-readable status labels for notification text (mirrors the frontend's
-- STATUS_LABEL map in src/hooks/use-repairs.ts).
CREATE OR REPLACE FUNCTION public.repair_status_label(s public.repair_status)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE s
    WHEN 'pending' THEN 'Pending'
    WHEN 'diagnosed' THEN 'Diagnosed'
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'awaiting_parts' THEN 'Awaiting parts'
    WHEN 'completed' THEN 'Completed'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'cancelled' THEN 'Cancelled'
  END
$$;

-- Extend tg_notify_repair: on every status change, in addition to the existing
-- in-app notification for the assigned technician, also write a client-facing row.
-- Prefer the machine's client (spec'd); repairs.machine_id is optional, so fall back
-- to the repair's own client when no machine is attached.
CREATE OR REPLACE FUNCTION public.tg_notify_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link          text := '/repairs/' || NEW.id::text;
  v_client_email  text;
  v_client_phone  text;
  v_message       text;
BEGIN
  -- Notify newly assigned technician
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'New repair assigned: ' || NEW.order_number,
            COALESCE(NEW.description, ''), v_link);
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'Repair assigned to you: ' || NEW.order_number,
            COALESCE(NEW.description, ''), v_link);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify assignee (in-app)
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (NEW.assigned_to, 'status',
              'Repair ' || NEW.order_number || ' → ' || NEW.status,
              NULL, v_link);
    END IF;

    -- Notify the client (email if we have one, otherwise simulated SMS)
    IF NEW.machine_id IS NOT NULL THEN
      SELECT c.email, c.phone INTO v_client_email, v_client_phone
        FROM public.machines m JOIN public.clients c ON c.id = m.client_id
       WHERE m.id = NEW.machine_id;
    ELSE
      SELECT c.email, c.phone INTO v_client_email, v_client_phone
        FROM public.clients c WHERE c.id = NEW.client_id;
    END IF;

    v_message := 'Your repair ' || NEW.order_number || ' status changed to '
                 || public.repair_status_label(NEW.status) || '.';

    IF v_client_email IS NOT NULL AND v_client_email <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Repair status update', v_message, v_link, 'email', v_client_email, NULL);
    ELSIF v_client_phone IS NOT NULL AND v_client_phone <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Repair status update', v_message, v_link, 'sms', v_client_phone, 'simulated');
    END IF;
    -- No email or phone on file: nothing to notify the client with.
  END IF;

  RETURN NEW;
END;
$$;
