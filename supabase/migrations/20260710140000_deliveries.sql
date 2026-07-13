-- Phase: delivery confirmation. One delivery record per repair (unique repair_id).
CREATE TABLE public.deliveries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id             uuid NOT NULL UNIQUE REFERENCES public.repairs(id) ON DELETE CASCADE,
  picked_up_by_name     text NOT NULL,
  picked_up_by_phone    text,
  handed_over_by        uuid NOT NULL REFERENCES public.profiles(id),
  notes                 text,
  delivered_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries_select_auth" ON public.deliveries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deliveries_insert_staff" ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Technician')
    OR public.has_role(auth.uid(), 'Receptionist')
  );
-- No UPDATE/DELETE policies: a delivery record is a one-time, immutable receipt.

-- Give delivery entries a readable label ("picked up by X") instead of falling
-- through to a bare row id, and map the entity_type the same way the other
-- domain tables do.
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

  IF TG_TABLE_NAME = 'repairs' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'repair_number'), v_entity_id::text);
  ELSIF TG_TABLE_NAME = 'parts' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'sku'),
                        (to_jsonb(COALESCE(NEW, OLD))->>'name'), v_entity_id::text);
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'role'), v_entity_id::text)
               || ' → user ' || (to_jsonb(COALESCE(NEW, OLD))->>'user_id');
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    v_label := COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'picked_up_by_name'), v_entity_id::text);
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
            WHEN 'deliveries'  THEN 'delivery'
            ELSE TG_TABLE_NAME
          END,
          v_entity_id, v_label, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_deliveries
  AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
