
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view clients" ON public.clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Reception insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));
CREATE POLICY "Admin/Reception update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));
CREATE POLICY "Admin/Reception delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX clients_name_idx ON public.clients (name);
CREATE INDEX clients_email_idx ON public.clients (email);

CREATE TABLE public.machines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  machine_type TEXT,
  year INTEGER,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view machines" ON public.machines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Reception insert machines" ON public.machines
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));
CREATE POLICY "Admin/Reception update machines" ON public.machines
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));
CREATE POLICY "Admin/Reception delete machines" ON public.machines
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'Admin') OR public.has_role(auth.uid(),'Receptionist'));

CREATE TRIGGER machines_set_updated_at BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE UNIQUE INDEX machines_serial_unique ON public.machines (serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX machines_client_idx ON public.machines (client_id);
