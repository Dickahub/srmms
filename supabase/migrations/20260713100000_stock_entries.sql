-- Append-only stock-entry ledger ("bon d'entrée"), replacing ad-hoc quantity
-- edits with a proper per-entry record: who entered it, who's keeping it,
-- supplier, and a human-readable entry number for the printed voucher.
--
-- Deviation from the literal spec, flagged here: an extra
-- `resulting_quantity_on_hand` column was added (not in the originally given
-- column list). The stock-entry voucher must show "new stock level after
-- entry" for ANY entry, including ones exported later from history — with no
-- snapshot, that number can only be reconstructed from today's current
-- quantity_on_hand, which is wrong for any entry that isn't the most recent
-- (later entries/consumption change it). This column captures the true
-- value at the moment of that specific entry, once, permanently.
CREATE SEQUENCE IF NOT EXISTS public.stock_entries_number_seq;

CREATE OR REPLACE FUNCTION public.generate_stock_entry_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.stock_entries_number_seq');
  RETURN 'ENT-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END;
$$;

CREATE TABLE public.stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  entered_by uuid NOT NULL REFERENCES public.profiles(id),
  kept_by uuid REFERENCES public.profiles(id),
  supplier text,
  notes text,
  entry_number text NOT NULL UNIQUE DEFAULT public.generate_stock_entry_number(),
  resulting_quantity_on_hand integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_entries_part_idx ON public.stock_entries (part_id, created_at);

GRANT SELECT, INSERT ON public.stock_entries TO authenticated;
GRANT ALL ON public.stock_entries TO service_role;

ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_entries_select_auth" ON public.stock_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stock_entries_insert_staff" ON public.stock_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'Receptionist')
    OR public.has_role(auth.uid(), 'Technician')
  );

-- No UPDATE/DELETE policies: stock_entries is append-only, like repair_logs.

CREATE TRIGGER audit_stock_entries
  AFTER INSERT ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- entered_by is never client-supplied (form has no such field) — force it to
-- the caller regardless of what's sent. resulting_quantity_on_hand is computed
-- from the part's current quantity_on_hand UNLESS the caller already supplied
-- it (the initial-registration path below does, to avoid double-counting —
-- see tg_parts_initial_stock_entry).
CREATE OR REPLACE FUNCTION public.tg_stock_entries_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.entered_by := auth.uid();
  IF NEW.resulting_quantity_on_hand IS NULL THEN
    SELECT quantity_on_hand + NEW.quantity INTO NEW.resulting_quantity_on_hand
      FROM public.parts WHERE id = NEW.part_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_entries_before_insert
  BEFORE INSERT ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_stock_entries_before_insert();

-- Applies the entry to the part's stock. pg_trigger_depth() = 1 means this
-- INSERT was the top-level statement (a genuine stock-entry form submission);
-- a depth > 1 means it was fired from within tg_parts_initial_stock_entry,
-- whose quantity was already baked into the new part's quantity_on_hand at
-- creation time, so applying it again here would double-count it.
CREATE OR REPLACE FUNCTION public.tg_stock_entries_apply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    UPDATE public.parts SET quantity_on_hand = quantity_on_hand + NEW.quantity WHERE id = NEW.part_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_entries_apply
  AFTER INSERT ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_stock_entries_apply();

-- Registering a part with an initial quantity > 0 gets its first stock_entries
-- row automatically, recording who registered it. resulting_quantity_on_hand
-- is passed explicitly as the part's own initial value (not current + quantity
-- — the row already exists with that value, there's no separate "before").
CREATE OR REPLACE FUNCTION public.tg_parts_initial_stock_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock_entries (part_id, quantity, entered_by, notes, resulting_quantity_on_hand)
  VALUES (NEW.id, NEW.quantity_on_hand, auth.uid(), 'Initial stock at part registration', NEW.quantity_on_hand);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_parts_initial_stock_entry
  AFTER INSERT ON public.parts
  FOR EACH ROW
  WHEN (NEW.quantity_on_hand > 0)
  EXECUTE FUNCTION public.tg_parts_initial_stock_entry();
