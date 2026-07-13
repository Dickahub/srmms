import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RepairForm } from "@/components/repairs/RepairForm";
import { useCreateRepair } from "@/hooks/use-repairs";

export const Route = createFileRoute("/_authenticated/repairs/new")({
  head: () => ({ meta: [{ title: "New repair — SRMMS" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
    machineId: typeof s.machineId === "string" ? s.machineId : undefined,
  }),
  component: NewRepair,
});

function NewRepair() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/repairs/new" });
  const createRepair = useCreateRepair();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/repairs"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New repair</h1>
        <p className="text-sm text-muted-foreground">Create a service order for a client's machine.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent>
          <RepairForm
            initial={{ client_id: search.clientId, machine_id: search.machineId ?? null }}
            submitting={createRepair.isPending}
            submitLabel="Create repair"
            onCancel={() => navigate({ to: "/repairs" })}
            onSubmit={(values) => {
              createRepair.mutate(values, {
                onSuccess: (r) => {
                  toast.success(`Repair ${r.order_number} created`);
                  navigate({ to: "/repairs/$repairId", params: { repairId: r.id } });
                },
                onError: (e) => toast.error(e.message),
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}