import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDelivery } from "@/hooks/use-deliveries";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

export function DeliveryCard({ repairId }: { repairId: string }) {
  const { data, isLoading } = useDelivery(repairId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Delivery</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No delivery record found.</p>
        ) : (
          <>
            <Row label="Picked up by" value={data.picked_up_by_name} />
            <Row label="Phone" value={data.picked_up_by_phone} />
            <Row label="Handed over by" value={data.handedOverBy?.name ?? "—"} />
            <Row label="Delivered at" value={new Date(data.delivered_at).toLocaleString()} />
            {data.notes && (
              <div className="sm:col-span-2">
                <Row label="Notes" value={<p className="whitespace-pre-wrap">{data.notes}</p>} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
