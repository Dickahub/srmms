-- Client-facing notification text should be in French (SECEL's clients), and the
-- 'completed' message specifically should read as an actual pickup notice rather
-- than a generic "status changed to X" line. Everything else stays the same
-- (in-app tech notifications, email/sms channel selection, delivery_status).
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
    -- Notify assignee (in-app, stays in English — internal staff notification)
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (NEW.assigned_to, 'status',
              'Repair ' || NEW.order_number || ' → ' || NEW.status,
              NULL, v_link);
    END IF;

    -- Notify the client (email if we have one, otherwise simulated SMS) — French
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
        'Votre réparation ' || NEW.order_number || ' est terminée. '
        || 'Vous pouvez venir récupérer votre équipement.'
      WHEN 'delivered' THEN
        'Votre réparation ' || NEW.order_number || ' a bien été livrée. Merci de votre confiance.'
      WHEN 'cancelled' THEN
        'Votre réparation ' || NEW.order_number || ' a été annulée. Contactez-nous pour plus de détails.'
      WHEN 'awaiting_parts' THEN
        'Votre réparation ' || NEW.order_number || ' est en attente de pièces détachées.'
      WHEN 'in_progress' THEN
        'Votre réparation ' || NEW.order_number || ' est en cours de traitement.'
      WHEN 'diagnosed' THEN
        'Le diagnostic de votre réparation ' || NEW.order_number || ' est terminé.'
      ELSE
        'Le statut de votre réparation ' || NEW.order_number || ' a été mis à jour.'
    END;

    IF v_client_email IS NOT NULL AND v_client_email <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Mise à jour de votre réparation', v_message, v_link, 'email', v_client_email, NULL);
    ELSIF v_client_phone IS NOT NULL AND v_client_phone <> '' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
      VALUES (NULL, 'status', 'Mise à jour de votre réparation', v_message, v_link, 'sms', v_client_phone, 'simulated');
    END IF;
    -- No email or phone on file: nothing to notify the client with.
  END IF;

  RETURN NEW;
END;
$$;
