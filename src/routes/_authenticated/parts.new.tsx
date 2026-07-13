import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartForm } from "@/components/parts/PartForm";
import { useCreatePart } from "@/hooks/use-parts";

export const Route = createFileRoute("/_authenticated/parts/new")({
  head: () => ({ meta: [{ title: "New part — SRMMS" }] }),
  component: NewPart,
});

function NewPart() {
  const navigate = useNavigate();
  const create = useCreatePart();
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/parts"><ArrowLeft className="mr-2 h-4 w-4" />Back to inventory</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>New part</CardTitle></CardHeader>
        <CardContent>
          <PartForm
            submitting={create.isPending}
            submitLabel="Create part"
            onCancel={() => navigate({ to: "/parts" })}
            onSubmit={(values) =>
              create.mutate(values, {
                onSuccess: (p) => { toast.success("Part created"); navigate({ to: "/parts/$partId", params: { partId: p.id } }); },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}