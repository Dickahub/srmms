import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RepairMetadataForm } from "@/components/repairs/RepairMetadataForm";
import { useRepair, useUpdateRepair } from "@/hooks/use-repairs";

export const Route = createFileRoute("/_authenticated/repairs/$repairId/edit")({
  head: () => ({ meta: [{ title: "Edit repair — SRMMS" }] }),
  component: EditRepair,
});

function EditRepair() {
  const { repairId } = Route.useParams();
  const navigate = useNavigate();
  const { data: repair, isLoading } = useRepair(repairId);
  const updateRepair = useUpdateRepair();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!repair) return <div className="text-muted-foreground">Repair not found.</div>;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/repairs/$repairId" params={{ repairId }}><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
      </Button>
      <div>
        <div className="font-mono text-xs text-muted-foreground">{repair.order_number}</div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit repair</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent>
          <RepairMetadataForm
            initial={repair}
            submitting={updateRepair.isPending}
            onCancel={() => navigate({ to: "/repairs/$repairId", params: { repairId } })}
            onSubmit={(values) => {
              updateRepair.mutate(
                { id: repair.id, patch: values },
                {
                  onSuccess: () => {
                    toast.success("Repair updated");
                    navigate({ to: "/repairs/$repairId", params: { repairId } });
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}