import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Package, Pencil, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeleteLocation, useLocation } from "@/hooks/use-locations";
import { useLocationContents } from "@/hooks/use-location-history";
import { useCurrentUser } from "@/hooks/use-current-user";
import { StatusBadge } from "@/components/repairs/StatusBadge";

export const Route = createFileRoute("/_authenticated/locations/$locationId")({
  head: () => ({ meta: [{ title: "Location — SRMMS" }] }),
  component: LocationDetail,
});

function LocationDetail() {
  const { locationId } = Route.useParams();
  const navigate = useNavigate();
  const { data: l, isLoading } = useLocation(locationId);
  const { data: contents, isLoading: contentsLoading } = useLocationContents(locationId);
  const del = useDeleteLocation();
  const { hasAny } = useCurrentUser();
  const canManage = hasAny(["Admin", "Receptionist"]);

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!l) return <div className="text-muted-foreground">Location not found.</div>;

  const parts = contents?.parts ?? [];
  const repairs = contents?.repairs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/locations"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
        </Button>
        <div className="flex gap-2">
          {canManage && (
            <Button asChild variant="outline" size="sm">
              <Link to="/locations/$locationId/edit" params={{ locationId }}><Pencil className="mr-2 h-4 w-4" />Edit</Link>
            </Button>
          )}
          {canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!confirm("Delete this location?")) return;
                del.mutate(l.id, {
                  onSuccess: () => { toast.success("Location deleted"); navigate({ to: "/locations" }); },
                  onError: (e) => toast.error(e.message),
                });
              }}
            ><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
          )}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{l.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Code:</span> <span className="font-mono">{l.code ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Description:</span> {l.description ?? "—"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contents</CardTitle>
          <p className="text-sm text-muted-foreground">
            {contentsLoading
              ? "Loading…"
              : `${parts.length} part${parts.length === 1 ? "" : "s"}, ${repairs.length} equipment item${repairs.length === 1 ? "" : "s"}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4 text-muted-foreground" />Parts
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contentsLoading ? (
                  <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : parts.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">No parts in this box.</TableCell></TableRow>
                ) : (
                  parts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to="/parts/$partId" params={{ partId: p.id }} className="hover:underline">
                          {p.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.quantity_on_hand}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-muted-foreground" />Repairs / equipment
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contentsLoading ? (
                  <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : repairs.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No equipment in this box.</TableCell></TableRow>
                ) : (
                  repairs.map((r) => {
                    const designation = [r.machine?.brand, r.machine?.model].filter(Boolean).join(" ") || r.machine?.machine_type || "—";
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="font-mono text-xs hover:underline">
                            {r.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>{designation}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}