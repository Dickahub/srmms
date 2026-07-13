-- AI diagnostic assistant conversation log, per repair. Append-only like
-- repair_logs — it's part of the repair's permanent record. Unlike repair_logs
-- (SELECT open to all authenticated), SELECT here is also Technician/Admin only.
CREATE TABLE public.diagnostic_chats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id    uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('user', 'assistant')),
  message      text NOT NULL,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diagnostic_chats_repair_idx ON public.diagnostic_chats (repair_id, created_at);

GRANT SELECT, INSERT ON public.diagnostic_chats TO authenticated;
GRANT ALL ON public.diagnostic_chats TO service_role;

ALTER TABLE public.diagnostic_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diagnostic_chats_select_tech_admin" ON public.diagnostic_chats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'));

CREATE POLICY "diagnostic_chats_insert_tech_admin" ON public.diagnostic_chats
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Technician'));

-- No UPDATE/DELETE policies: append-only.
