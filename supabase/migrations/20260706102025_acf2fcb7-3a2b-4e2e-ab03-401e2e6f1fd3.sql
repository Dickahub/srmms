-- Phase 3: Repair orders

CREATE TYPE public.repair_status AS ENUM ('pending','in_progress','awaiting_parts','completed','cancelled');
CREATE TYPE public.repair_priority AS ENUM ('low','normal','high','urgent');

CREATE SEQUENCE IF NOT EXISTS public.repairs_number_seq;

CREATE OR REPLACE FUNCTION public.generate_repair_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.repairs_number_seq');
  RETURN 'SR-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
END;
$$;

CREATE TABLE public.repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.generate_repair_number(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.repair_status NOT NULL DEFAULT 'pending',
  priority public.repair_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  intake_date date NOT NULL DEFAULT current_date,
  due_date date,
  completed_at timestamptz,
  diagnosis text,
  resolution text,
  cost numeric(12,2),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repairs_client_idx ON public.repairs(client_id);
CREATE INDEX repairs_machine_idx ON public.repairs(machine_id);
CREATE INDEX repairs_status_idx ON public.repairs(status);
CREATE INDEX repairs_assigned_idx ON public.repairs(assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repairs TO authenticated;
GRANT ALL ON public.repairs TO service_role;
GRANT USAGE ON SEQUENCE public.repairs_number_seq TO authenticated, service_role;

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view repairs"
  ON public.repairs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Receptionist can insert repairs"
  ON public.repairs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));

CREATE POLICY "Admin/Receptionist/Technician can update repairs"
  ON public.repairs FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'Admin')
    OR public.has_role(auth.uid(),'Receptionist')
    OR public.has_role(auth.uid(),'Technician')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'Admin')
    OR public.has_role(auth.uid(),'Receptionist')
    OR public.has_role(auth.uid(),'Technician')
  );

CREATE POLICY "Admin/Receptionist can delete repairs"
  ON public.repairs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));

CREATE TRIGGER trg_repairs_updated_at
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
