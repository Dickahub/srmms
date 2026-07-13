import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationForm } from "@/components/locations/LocationForm";
import { useCreateLocation } from "@/hooks/use-locations";

export const Route = createFileRoute("/_authenticated/locations/new")({
  head: () => ({ meta: [{ title: "New location — SRMMS" }] }),
  component: NewLocation,
});

function NewLocation() {
  const navigate = useNavigate();
  const create = useCreateLocation();
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/locations"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>New location</CardTitle></CardHeader>
        <CardContent>
          <LocationForm
            submitting={create.isPending}
            submitLabel="Create location"
            onCancel={() => navigate({ to: "/locations" })}
            onSubmit={(v) =>
              create.mutate(v, {
                onSuccess: (l) => { toast.success("Location created"); navigate({ to: "/locations/$locationId", params: { locationId: l.id } }); },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}