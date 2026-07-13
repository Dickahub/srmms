import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  friendlyClientError, useClient, useClientRepairCount, useDeleteClient, useSetClientActive,
} from "@/hooks/use-clients";
import { friendlyMachineError, useClientMachines, useCreateMachine } from "@/hooks/use-machines";
import { useCurrentUser } from "@/hooks/use-current-user";
import { MachineForm } from "@/components/clients/MachineForm";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client — SRMMS" }] }),
  component: ClientDetail,
});

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value?.trim() ? value : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function ClientDetail() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(clientId);
  const { data: machines } = useClientMachines(clientId);
  const { data: repairCount } = useClientRepairCount(clientId);
  const { hasAny } = useCurrentUser();
  const canEdit = hasAny(["Admin", "Receptionist"]);
  const isAdmin = hasAny(["Admin"]);
  const hasRepairHistory = (repairCount ?? 0) > 0;

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createMachine = useCreateMachine();
  const deleteClient = useDeleteClient();
  const setActive = useSetClientActive();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!client) return <div className="text-muted-foreground">Client not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/clients"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
        </Button>
        <div className="flex gap-2">
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link to="/clients/$clientId/edit" params={{ clientId }}>
                <Pencil className="mr-2 h-4 w-4" />Edit
              </Link>
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              disabled={setActive.isPending}
              onClick={() =>
                setActive.mutate(
                  { id: client.id, isActive: !client.is_active },
                  {
                    onSuccess: () => toast.success(client.is_active ? "Client archived" : "Client reactivated"),
                    onError: (e) => toast.error(friendlyClientError(e)),
                  },
                )
              }
            >
              {client.is_active ? (
                <><Archive className="mr-2 h-4 w-4" />Archive</>
              ) : (
                <><ArchiveRestore className="mr-2 h-4 w-4" />Reactivate</>
              )}
            </Button>
          )}
          {canEdit && (
            hasRepairHistory ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button variant="destructive" size="sm" disabled className="pointer-events-none">
                        <Trash2 className="mr-2 h-4 w-4" />Delete
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>This client has repair history — use Archive instead</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </Button>
            )
          )}
        </div>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {client.name}
          {!client.is_active && <Badge variant="outline">Archived</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">Client details and equipment.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Contact person" value={client.contact_person} />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Phone" value={client.phone} />
          <InfoRow label="Tax ID" value={client.tax_id} />
          <div className="sm:col-span-2"><InfoRow label="Address" value={client.address} /></div>
          {client.notes && <div className="sm:col-span-2 lg:col-span-3"><InfoRow label="Notes" value={client.notes} /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Machines ({machines?.length ?? 0})</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Add machine
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!machines || machines.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No machines yet.</TableCell></TableRow>
              ) : (
                machines.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link to="/machines/$machineId" params={{ machineId: m.id }} className="hover:underline">
                        {m.brand ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{m.model ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{m.serial_number ?? "—"}</TableCell>
                    <TableCell>{m.machine_type ?? "—"}</TableCell>
                    <TableCell>{m.year ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add machine</DialogTitle></DialogHeader>
          <MachineForm
            clientId={clientId}
            submitting={createMachine.isPending}
            submitLabel="Add machine"
            onCancel={() => setAddOpen(false)}
            onSubmit={(values) => {
              createMachine.mutate(values, {
                onSuccess: () => {
                  toast.success("Machine added");
                  setAddOpen(false);
                },
                onError: (e) => toast.error(friendlyMachineError(e)),
              });
            }}
            onUseExisting={(machine) => {
              setAddOpen(false);
              navigate({ to: "/repairs/new", search: { clientId: machine.client_id, machineId: machine.id } });
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete all machines linked to {client.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteClient.mutate(client.id, {
                  onSuccess: () => {
                    toast.success("Client deleted");
                    navigate({ to: "/clients" });
                  },
                  onError: (e) => toast.error(friendlyClientError(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}