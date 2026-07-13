-- PARTS
CREATE TABLE public.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  unit text NOT NULL DEFAULT 'unit',
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  location text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX parts_sku_unique_idx ON public.parts (lower(sku));
CREATE INDEX parts_name_idx ON public.parts (lower(name));
CREATE INDEX parts_category_idx ON public.parts (category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_select_auth" ON public.parts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "parts_insert_staff" ON public.parts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
CREATE POLICY "parts_update_staff" ON public.parts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
CREATE POLICY "parts_delete_staff" ON public.parts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));

CREATE TRIGGER parts_set_updated_at
  BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- REPAIR_PARTS
CREATE TABLE public.repair_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX repair_parts_repair_idx ON public.repair_parts (repair_id);
CREATE INDEX repair_parts_part_idx ON public.repair_parts (part_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_parts TO authenticated;
GRANT ALL ON public.repair_parts TO service_role;

ALTER TABLE public.repair_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "repair_parts_select_auth" ON public.repair_parts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "repair_parts_insert_staff_tech" ON public.repair_parts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  );
CREATE POLICY "repair_parts_update_staff_tech" ON public.repair_parts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  );
CREATE POLICY "repair_parts_delete_staff" ON public.repair_parts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));

CREATE TRIGGER repair_parts_set_updated_at
  BEFORE UPDATE ON public.repair_parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- STOCK MOVEMENT TRIGGERS
CREATE OR REPLACE FUNCTION public.tg_repair_parts_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.parts SET quantity_on_hand = quantity_on_hand - NEW.quantity WHERE id = NEW.part_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity WHERE id = OLD.part_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.part_id = NEW.part_id THEN
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity - NEW.quantity WHERE id = NEW.part_id;
    ELSE
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand + OLD.quantity WHERE id = OLD.part_id;
      UPDATE public.parts SET quantity_on_hand = quantity_on_hand - NEW.quantity WHERE id = NEW.part_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER repair_parts_stock_ins
  AFTER INSERT ON public.repair_parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_repair_parts_stock();
CREATE TRIGGER repair_parts_stock_upd
  AFTER UPDATE ON public.repair_parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_repair_parts_stock();
CREATE TRIGGER repair_parts_stock_del
  AFTER DELETE ON public.repair_parts
  FOR EACH ROW EXECUTE FUNCTION public.tg_repair_parts_stock();