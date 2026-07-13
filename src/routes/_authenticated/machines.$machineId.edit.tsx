import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MachineForm } from "@/components/clients/MachineForm";
import { friendlyMachineError, useMachine, useUpdateMachine } from "@/hooks/use-machines";

export const Route = createFileRoute("/_authenticated/machines/$machineId/edit")({
  head: () => ({ meta: [{ title: "Edit machine — SRMMS" }] }),
  component: EditMachine,
});

function EditMachine() {
  const { machineId } = Route.useParams();
  const navigate = useNavigate();
  const { data: machine, isLoading } = useMachine(machineId);
  const update = useUpdateMachine();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!machine) return <div className="text-muted-foreground">Machine not found.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/machines/$machineId" params={{ machineId }}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back
        </Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>Edit machine</CardTitle></CardHeader>
        <CardContent>
          <MachineForm
            clientId={machine.client_id}
            initial={machine}
            submitting={update.isPending}
            submitLabel="Save changes"
            onCancel={() => navigate({ to: "/machines/$machineId", params: { machineId } })}
            onSubmit={(values) => {
              const { client_id: _clientId, ...patch } = values;
              update.mutate(
                { id: machineId, patch },
                {
                  onSuccess: () => {
                    toast.success("Machine updated");
                    navigate({ to: "/machines/$machineId", params: { machineId } });
                  },
                  onError: (e) => toast.error(friendlyMachineError(e)),
                },
              );
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}