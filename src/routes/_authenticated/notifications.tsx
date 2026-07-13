import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/hooks/use-notifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — SRMMS" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data, isLoading } = useNotifications(100);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "You're all caught up."}</p>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="outline" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-2 h-4 w-4" />Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <Bell className="mx-auto mb-2 h-6 w-6" />No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                    !n.read_at && "bg-primary/5",
                  )}
                  onClick={() => {
                    if (!n.read_at) markOne.mutate(n.id);
                    if (n.link) navigate({ to: n.link });
                  }}
                >
                  <div className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}