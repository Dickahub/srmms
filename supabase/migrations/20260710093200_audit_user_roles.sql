-- Extend the audit trail to cover role changes (user_roles), which the /users
-- admin page will let Admins edit. Add a user_roles-aware label/entity_type
-- branch to tg_audit() so entries read as "Admin → user <id>" instead of a
-- bare row id, then attach the same audit trigger used on the other tables.

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
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'role'), v_entity_id::text)
               || ' → user ' || (to_jsonb(COALESCE(NEW, OLD))->>'user_id');
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
            WHEN 'repairs'     THEN 'repair'
            WHEN 'parts'       THEN 'part'
            WHEN 'clients'     THEN 'client'
            WHEN 'machines'    THEN 'machine'
            WHEN 'user_roles'  THEN 'user_role'
            ELSE TG_TABLE_NAME
          END,
          v_entity_id, v_label, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
