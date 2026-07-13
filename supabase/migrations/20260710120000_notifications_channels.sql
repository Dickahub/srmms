-- Extend notifications with a delivery channel so a single status-change event can
-- fan out to an in-app row (existing behavior) plus a client-facing email/sms row.
ALTER TABLE public.notifications
  ADD COLUMN channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms')),
  ADD COLUMN recipient text,
  ADD COLUMN delivery_status text CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'simulated', 'failed'));

-- Client-facing rows have no app user (the recipient is a client's email/phone, not
-- an auth.users row), so user_id can no longer be mandatory.
ALTER TABLE public.notifications ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX notifications_channel_idx ON public.notifications (channel);

-- The Notifications Log page (Admin/Receptionist) needs to see every row, not just
-- "your own" — additive to the existing notif_select_own policy.
CREATE POLICY "notif_select_admin_reception" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'Admin') OR public.has_role(auth.uid(), 'Receptionist'));
