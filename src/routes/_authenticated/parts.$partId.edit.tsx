import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartForm } from "@/components/parts/PartForm";
import { usePart, useUpdatePart } from "@/hooks/use-parts";

export const Route = createFileRoute("/_authenticated/parts/$partId/edit")({
  head: () => ({ meta: [{ title: "Edit part — SRMMS" }] }),
  component: EditPart,
});

function EditPart() {
  const { partId } = Route.useParams();
  const navigate = useNavigate();
  const { data: part, isLoading } = usePart(partId);
  const update = useUpdatePart();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!part) return <div className="text-muted-foreground">Part not found.</div>;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/parts/$partId" params={{ partId }}><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>Edit part</CardTitle></CardHeader>
        <CardContent>
          <PartForm
            mode="edit"
            initial={part}
            submitting={update.isPending}
            submitLabel="Save changes"
            onCancel={() => navigate({ to: "/parts/$partId", params: { partId } })}
            onSubmit={(values) =>
              update.mutate(
                { id: part.id, patch: values },
                {
                  onSuccess: () => { toast.success("Part updated"); navigate({ to: "/parts/$partId", params: { partId } }); },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}