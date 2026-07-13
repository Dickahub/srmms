import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "@/components/clients/ClientForm";
import { useClient, useUpdateClient } from "@/hooks/use-clients";

export const Route = createFileRoute("/_authenticated/clients/$clientId/edit")({
  head: () => ({ meta: [{ title: "Edit client — SRMMS" }] }),
  component: EditClient,
});

function EditClient() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(clientId);
  const update = useUpdateClient();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!client) return <div className="text-muted-foreground">Client not found.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/clients/$clientId" params={{ clientId }}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back
        </Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>Edit client</CardTitle></CardHeader>
        <CardContent>
          <ClientForm
            initial={client}
            submitting={update.isPending}
            submitLabel="Save changes"
            onCancel={() => navigate({ to: "/clients/$clientId", params: { clientId } })}
            onSubmit={(values) => {
              update.mutate(
                { id: clientId, patch: values },
                {
                  onSuccess: () => {
                    toast.success("Client updated");
                    navigate({ to: "/clients/$clientId", params: { clientId } });
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