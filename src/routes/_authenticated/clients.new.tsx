import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "@/components/clients/ClientForm";
import { useCreateClient } from "@/hooks/use-clients";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({ meta: [{ title: "New client — SRMMS" }] }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const create = useCreateClient();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/clients"><ArrowLeft className="mr-2 h-4 w-4" />Back to clients</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>New client</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm
            submitting={create.isPending}
            submitLabel="Create client"
            onCancel={() => navigate({ to: "/clients" })}
            onSubmit={(values) => {
              create.mutate(values, {
                onSuccess: (c) => {
                  toast.success("Client created");
                  navigate({ to: "/clients/$clientId", params: { clientId: c.id } });
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