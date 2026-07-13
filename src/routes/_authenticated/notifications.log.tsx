import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useNotificationsLog, type DeliveryStatus, type NotificationChannel,
} from "@/hooks/use-notifications";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/notifications/log")({
  head: () => ({ meta: [{ title: "Notifications log — SRMMS" }] }),
  component: NotificationsLogPage,
});

function NotificationsLogPage() {
  const [channel, setChannel] = useState<NotificationChannel | "all">("all");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | "none" | "all">("all");
  const { data, isLoading } = useNotificationsLog({ channel, deliveryStatus });
  const { hasAny, loading } = useCurrentUser();

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!hasAny(["Admin", "Receptionist"])) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Only administrators and receptionists can view the notifications log.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications log</h1>
        <p className="text-sm text-muted-foreground">Every in-app, email and SMS notification sent by the system.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={channel} onValueChange={(v) => setChannel(v as NotificationChannel | "all")}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="in_app">In-app</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as DeliveryStatus | "none" | "all")}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Delivery status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="none">— (in-app)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">When</TableHead>
                <TableHead className="w-[90px]">Channel</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No notifications found.</TableCell></TableRow>
              ) : (
                data.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{n.channel.replace("_", "-")}</TableCell>
                    <TableCell>
                      {n.delivery_status ? (
                        <Badge variant={n.delivery_status === "failed" ? "destructive" : n.delivery_status === "sent" ? "default" : "secondary"}>
                          {n.delivery_status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{n.recipient ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
