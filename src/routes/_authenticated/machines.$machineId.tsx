import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteMachine, useMachine } from "@/hooks/use-machines";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/machines/$machineId")({
  head: () => ({ meta: [{ title: "Machine — SRMMS" }] }),
  component: MachineDetail,
});

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value !== null && value !== undefined && value !== "" ? value : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function MachineDetail() {
  const { machineId } = Route.useParams();
  const navigate = useNavigate();
  const { data: machine, isLoading } = useMachine(machineId);
  const { hasAny } = useCurrentUser();
  const canEdit = hasAny(["Admin", "Receptionist"]);
  const del = useDeleteMachine();
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!machine) return <div className="text-muted-foreground">Machine not found.</div>;

  const title = [machine.brand, machine.model].filter(Boolean).join(" ") || "Machine";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          {machine.client ? (
            <Link to="/clients/$clientId" params={{ clientId: machine.client.id }}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to {machine.client.name}
            </Link>
          ) : (
            <Link to="/clients"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
          )}
        </Button>
        {canEdit && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/machines/$machineId/edit" params={{ machineId }}>
                <Pencil className="mr-2 h-4 w-4" />Edit
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </Button>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {machine.client && (
          <p className="text-sm text-muted-foreground">
            Owned by{" "}
            <Link to="/clients/$clientId" params={{ clientId: machine.client.id }} className="hover:underline">
              {machine.client.name}
            </Link>
          </p>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Brand" value={machine.brand} />
          <InfoRow label="Model" value={machine.model} />
          <InfoRow label="Serial number" value={machine.serial_number} />
          <InfoRow label="Type" value={machine.machine_type} />
          <InfoRow label="Year" value={machine.year} />
          {machine.notes && <div className="sm:col-span-2 lg:col-span-3"><InfoRow label="Notes" value={machine.notes} /></div>}
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this machine?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                del.mutate(
                  { id: machine.id, clientId: machine.client_id },
                  {
                    onSuccess: () => {
                      toast.success("Machine deleted");
                      navigate({ to: "/clients/$clientId", params: { clientId: machine.client_id } });
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}