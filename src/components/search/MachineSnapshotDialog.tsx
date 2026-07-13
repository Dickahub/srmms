import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge, PriorityBadge } from "@/components/repairs/StatusBadge";
import { useMachineSnapshot } from "@/hooks/use-machine-snapshot";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

type Props = {
  machineId: string;
  /** If the search match was a repair (not a machine), pin the snapshot to that repair. */
  pinnedRepairId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MachineSnapshotDialog({ machineId, pinnedRepairId, open, onOpenChange }: Props) {
  const { data, isLoading } = useMachineSnapshot(machineId, pinnedRepairId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data ? [data.machine.brand, data.machine.model].filter(Boolean).join(" ") || "Machine" : "Machine"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Machine not found.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Type" value={data.machine.machine_type} />
              <Row label="Serial number" value={data.machine.serial_number} />
              <Row
                label="Client"
                value={
                  data.machine.client && (
                    <Link to="/clients/$clientId" params={{ clientId: data.machine.client.id }} className="hover:underline">
                      {data.machine.client.name}
                    </Link>
                  )
                }
              />
              <Row
                label="Machine page"
                value={
                  <Link to="/machines/$machineId" params={{ machineId: data.machine.id }} className="hover:underline">
                    View full machine record
                  </Link>
                }
              />
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 text-sm font-medium">Current repair</div>
              {data.currentRepair ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/repairs/$repairId"
                      params={{ repairId: data.currentRepair.id }}
                      className="font-mono text-xs hover:underline"
                    >
                      {data.currentRepair.order_number}
                    </Link>
                    <StatusBadge status={data.currentRepair.status} />
                    <PriorityBadge priority={data.currentRepair.priority} />
                  </div>
                  <Row label="Assigned technician" value={data.currentRepair.technicianName ?? "Unassigned"} />
                  <Row
                    label="Location / holder"
                    value={
                      data.currentRepair.holder
                        ? `Held by ${data.currentRepair.holder.name}`
                        : data.currentRepair.location
                          ? data.currentRepair.location.code || data.currentRepair.location.name
                          : null
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No repairs on file.</p>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Repair history ({data.repairs.length})</div>
              {data.repairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repairs yet.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                  {data.repairs.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0">
                      <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">
                        <span className="font-mono text-xs">{r.order_number}</span> — {r.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                        <StatusBadge status={r.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
