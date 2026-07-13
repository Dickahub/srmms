import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationChannel = "in_app" | "email" | "sms";
export type DeliveryStatus = "sent" | "simulated" | "failed";

export type Notification = {
  id: string;
  user_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  channel: NotificationChannel;
  recipient: string | null;
  delivery_status: DeliveryStatus | null;
  created_at: string;
};

export function useNotifications(limit = 30) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      // Admin/Receptionist can now SELECT every row (for the Notifications Log page),
      // so this must filter to "my own" explicitly instead of relying on RLS alone —
      // otherwise their personal bell would show everyone's notifications.
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: auth }) => {
      if (cancelled) return;
      const userId = auth.user?.id;
      if (!userId) return; // nothing to subscribe to without a signed-in user

      try {
        // supabase.channel(topic) reuses an existing channel instance when the topic
        // string matches one it already knows about — a fixed topic name meant two
        // simultaneously-mounted consumers (the bell + the /notifications page, or a
        // StrictMode double-invoke) could both grab the SAME already-subscribed
        // channel and call .on() on it a second time, which is exactly what threw
        // "cannot add postgres_changes callbacks ... after subscribe()" and crashed
        // the app. A per-mount-unique topic guarantees .channel() always hands back
        // a genuinely fresh channel, so .on() is always called before that channel's
        // own .subscribe().
        const topic = `notifications-user-${userId}-${Math.random().toString(36).slice(2)}`;
        channel = supabase
          .channel(topic)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
            () => qc.invalidateQueries({ queryKey: ["notifications"] }),
          )
          .subscribe();
      } catch (err) {
        // Notifications realtime is a non-critical widget — never let it take the
        // rest of the app down.
        console.error("useNotifications: failed to subscribe to realtime updates", err);
      }
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// Admin/Receptionist-only log of every notification (in-app, email, sms) — relies
// on the notif_select_admin_reception RLS policy to actually return all rows.
export function useNotificationsLog(filters?: {
  channel?: NotificationChannel | "all";
  deliveryStatus?: DeliveryStatus | "none" | "all";
}) {
  return useQuery({
    queryKey: ["notifications-log", filters ?? {}],
    queryFn: async () => {
      let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
      if (filters?.channel && filters.channel !== "all") {
        q = q.eq("channel", filters.channel);
      }
      if (filters?.deliveryStatus && filters.deliveryStatus !== "all") {
        q = filters.deliveryStatus === "none" ? q.is("delivery_status", null) : q.eq("delivery_status", filters.deliveryStatus);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}