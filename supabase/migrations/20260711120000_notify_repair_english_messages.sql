-- Client-facing notification text moves from French to English (product
-- decision: all user-facing text in the app, including client communications,
-- is English). Supersedes 20260710160100_notify_repair_french_messages.sql —
-- only the client-facing message/title block changes; in-app staff
-- notifications and channel selection logic are unchanged.
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
    -- Notify assignee (in-app, internal staff notification)
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

    v_message := CASE NEW.status
      WHEN 'completed' THEN
        'Your repair ' || NEW.order_number || ' is complete. '
        || 'You can come pick up your equipment.'
      WHEN 'delivered' THEN
        'Your repair ' || NEW.order_number || ' has been delivered. Thank you for your business.'
      WHEN 'cancelled' THEN
        'Your repair ' || NEW.order_number || ' has been cancelled. Contact us for more details.'
      WHEN 'awaiting_parts' THEN
        'Your repair ' || NEW.order_number || ' is awaiting parts.'
      WHEN 'in_progress' THEN
        'Your repair ' || NEW.order_number || ' is in progress.'
      WHEN 'diagnosed' THEN
        'The diagnosis for your repair ' || NEW.order_number || ' is complete.'
      ELSE
        'The status of your repair ' || NEW.order_number || ' has been updated.'
    END;

    IF v_client_email IS NOT NULL AND v_client_email <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Update on your repair', v_message, v_link, 'email', v_client_email, NULL);
    ELSIF v_client_phone IS NOT NULL AND v_client_phone <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Update on your repair', v_message, v_link, 'sms', v_client_phone, 'simulated');
    END IF;
    -- No email or phone on file: nothing to notify the client with.
  END IF;

  RETURN NEW;
END;
$$;
