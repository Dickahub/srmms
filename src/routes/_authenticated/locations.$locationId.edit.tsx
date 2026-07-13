import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationForm } from "@/components/locations/LocationForm";
import { useLocation, useUpdateLocation } from "@/hooks/use-locations";

export const Route = createFileRoute("/_authenticated/locations/$locationId/edit")({
  head: () => ({ meta: [{ title: "Edit location — SRMMS" }] }),
  component: EditLocation,
});

function EditLocation() {
  const { locationId } = Route.useParams();
  const navigate = useNavigate();
  const { data: l, isLoading } = useLocation(locationId);
  const update = useUpdateLocation();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!l) return <div className="text-muted-foreground">Location not found.</div>;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/locations/$locationId" params={{ locationId }}><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>Edit location</CardTitle></CardHeader>
        <CardContent>
          <LocationForm
            initial={l}
            submitting={update.isPending}
            submitLabel="Save changes"
            onCancel={() => navigate({ to: "/locations/$locationId", params: { locationId } })}
            onSubmit={(patch) =>
              update.mutate({ id: l.id, patch }, {
                onSuccess: () => { toast.success("Location updated"); navigate({ to: "/locations/$locationId", params: { locationId } }); },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}