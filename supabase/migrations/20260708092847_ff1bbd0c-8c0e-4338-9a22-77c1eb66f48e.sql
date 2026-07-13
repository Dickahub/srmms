
-- =========================================================
-- Phase 5: Locations, Notifications, Audit Log
-- =========================================================

-- ---------- LOCATIONS -------------------------------------
CREATE TABLE public.locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  code         text,
  description  text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX locations_name_lower_uidx ON public.locations (lower(name));
CREATE UNIQUE INDEX locations_code_lower_uidx ON public.locations (lower(code)) WHERE code IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locations_select_auth" ON public.locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "locations_insert_admin_tech" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'));
CREATE POLICY "locations_update_admin_tech" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'));
CREATE POLICY "locations_delete_admin" ON public.locations
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));

CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Link parts + repairs to a location (optional)
ALTER TABLE public.parts   ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE public.repairs ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
CREATE INDEX parts_location_id_idx   ON public.parts(location_id);
CREATE INDEX repairs_location_id_idx ON public.repairs(location_id);


-- ---------- NOTIFICATIONS ---------------------------------
CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'info',
  title       text NOT NULL,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx  ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- No direct INSERT policy: notifications are created via SECURITY DEFINER triggers only.


-- ---------- AUDIT LOG -------------------------------------
CREATE TABLE public.audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email    text,
  action         text NOT NULL,          -- 'insert' | 'update' | 'delete'
  entity_type    text NOT NULL,          -- 'repair' | 'part' | 'client' | 'machine'
  entity_id      uuid,
  entity_label   text,
  diff           jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON public.audit_log(created_at DESC);
CREATE INDEX audit_log_entity_idx  ON public.audit_log(entity_type, entity_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
-- No INSERT/UPDATE/DELETE policies: writes happen through SECURITY DEFINER trigger.


-- ---------- AUDIT TRIGGER ---------------------------------
CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_email      text;
  v_label      text;
  v_entity_id  uuid;
  v_action     text := lower(TG_OP);
  v_diff       jsonb;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD)->>'id')::uuid;
  ELSE
    v_entity_id := (to_jsonb(NEW)->>'id')::uuid;
  END IF;

  -- Best-effort human label
  IF TG_TABLE_NAME = 'repairs' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'repair_number'), v_entity_id::text);
  ELSIF TG_TABLE_NAME = 'parts' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'sku'),
                        (to_jsonb(COALESCE(NEW, OLD))->>'name'), v_entity_id::text);
  ELSE
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'name'),
                        (to_jsonb(COALESCE(NEW, OLD))->>'serial_number'),
                        v_entity_id::text);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
      INTO v_diff
      FROM (
        SELECT o.key AS key, o.value AS old_val, n.value AS new_val
          FROM jsonb_each(to_jsonb(OLD)) o
          JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
         WHERE o.value IS DISTINCT FROM n.value
           AND o.key NOT IN ('updated_at')
      ) d;
  ELSIF TG_OP = 'INSERT' THEN
    v_diff := to_jsonb(NEW);
  ELSE
    v_diff := to_jsonb(OLD);
  END IF;

  IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_log (actor_user_id, actor_email, action, entity_type, entity_id, entity_label, diff)
  VALUES (v_actor, v_email, v_action,
          CASE TG_TABLE_NAME
            WHEN 'repairs'  THEN 'repair'
            WHEN 'parts'    THEN 'part'
            WHEN 'clients'  THEN 'client'
            WHEN 'machines' THEN 'machine'
            ELSE TG_TABLE_NAME
          END,
          v_entity_id, v_label, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_repairs  AFTER INSERT OR UPDATE OR DELETE ON public.repairs  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
CREATE TRIGGER audit_parts    AFTER INSERT OR UPDATE OR DELETE ON public.parts    FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
CREATE TRIGGER audit_clients  AFTER INSERT OR UPDATE OR DELETE ON public.clients  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
CREATE TRIGGER audit_machines AFTER INSERT OR UPDATE OR DELETE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.tg_audit();


-- ---------- NOTIFICATION TRIGGER (repairs) ---------------
CREATE OR REPLACE FUNCTION public.tg_notify_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := '/repairs/' || NEW.id::text;
BEGIN
  -- Notify newly assigned technician
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'New repair assigned: ' || NEW.repair_number,
            COALESCE(NEW.issue_description, ''), v_link);
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'assignment',
            'Repair assigned to you: ' || NEW.repair_number,
            COALESCE(NEW.issue_description, ''), v_link);
  END IF;

  -- Notify assignee on status change
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.assigned_to, 'status',
            'Repair ' || NEW.repair_number || ' → ' || NEW.status,
            NULL, v_link);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_repair
AFTER INSERT OR UPDATE ON public.repairs
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_repair();
