import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, FileDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  useRepair, useDeleteRepair, useUpdateRepair, useRetrieveRepair, usePlaceRepairLocation, useSetRepairArchived,
  NEXT_STATUSES, STATUS_LABEL, type RepairStatus,
} from "@/hooks/use-repairs";
import { useRepairLocationHistory } from "@/hooks/use-location-history";
import { useRepairLogs } from "@/hooks/use-repair-logs";
import { useRepairParts } from "@/hooks/use-repair-parts";
import { useDelivery } from "@/hooks/use-deliveries";
import { useUsersWithRoles, technicianDisplayName } from "@/hooks/use-users";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PriorityBadge, StatusBadge } from "@/components/repairs/StatusBadge";
import { RepairPartsSection } from "@/components/repairs/RepairPartsSection";
import { RepairLogSection } from "@/components/repairs/RepairLogSection";
import { DeliveryConfirmDialog } from "@/components/repairs/DeliveryConfirmDialog";
import { DeliveryCard } from "@/components/repairs/DeliveryCard";
import { DiagnosticChatCard } from "@/components/repairs/DiagnosticChatCard";
import { CustodySection } from "@/components/custody/CustodySection";
import { generateRepairPdf } from "@/lib/repair-pdf";
import { formatCurrency } from "@/lib/format-currency";

export const Route = createFileRoute("/_authenticated/repairs/$repairId")({
  head: () => ({ meta: [{ title: "Repair — SRMMS" }] }),
  component: RepairDetail,
});

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

// Small pencil-affordance + dialog for fields with narrow, identity/role-based
// editorship (diagnosis, resolution, cost) — visible only when `canEdit` is
// true for the current viewer, matching the "hidden entirely" convention used
// for role-gating elsewhere rather than a disabled control.
function EditableField({
  label, displayValue, canEdit, kind, initialValue, onSave, submitting,
}: {
  label: string;
  displayValue: React.ReactNode;
  canEdit: boolean;
  kind: "textarea" | "number";
  initialValue: string;
  onSave: (raw: string) => void;
  submitting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialValue);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {canEdit && (
          <button
            type="button"
            aria-label={`Edit ${label}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { setDraft(initialValue); setOpen(true); }}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="text-sm">{displayValue ?? <span className="text-muted-foreground">—</span>}</div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {label.toLowerCase()}</DialogTitle></DialogHeader>
          {kind === "textarea" ? (
            <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <Input type="number" min="0" step="1" value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => { onSave(draft); setOpen(false); }}
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RepairDetail() {
  const { repairId } = Route.useParams();
  const navigate = useNavigate();
  const { data: repair, isLoading } = useRepair(repairId);
  const { user, hasAny } = useCurrentUser();
  // Editing repair metadata (description/priority/due date) is Admin/Receptionist
  // only — hidden entirely for Technicians.
  const canEditMetadata = hasAny(["Admin", "Receptionist"]);
  const canDelete = hasAny(["Admin", "Receptionist"]);
  const canAssignAnyone = hasAny(["Admin", "Receptionist"]);
  // Status transitions: Technicians perform all of them; Receptionist may only
  // confirm delivery; Admin performs none (server-enforced by
  // tg_check_repair_status_transition) — Admin still sees the status badge,
  // just no controls to change it.
  const isAdmin = hasAny(["Admin"]);
  const isReceptionist = hasAny(["Receptionist"]);
  const isTechnician = hasAny(["Technician"]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [logPrefill, setLogPrefill] = useState<{ text: string } | null>(null);
  const updateRepair = useUpdateRepair();
  const deleteRepair = useDeleteRepair();
  const retrieveRepair = useRetrieveRepair();
  const placeRepair = usePlaceRepairLocation();
  const setArchived = useSetRepairArchived();
  const { data: history, isLoading: historyLoading } = useRepairLocationHistory(repair?.id);
  const { data: users } = useUsersWithRoles();
  const technicians = (users ?? []).filter((u) => u.roles.includes("Technician"));
  const { data: logs } = useRepairLogs(repair?.id);
  const { data: repairParts } = useRepairParts(repair?.id);
  const { data: delivery } = useDelivery(repair?.id);

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!repair) return <div className="text-muted-foreground">Repair not found.</div>;

  const assignedTechnician = users?.find((u) => u.id === repair.assigned_to) ?? null;

  // Diagnosis/resolution are the assigned technician's professional conclusions —
  // editable by that technician only (not Admin/Receptionist, not any other
  // technician), enforced server-side by tg_repairs_metadata_guard. Diagnosis
  // opens up once there's actually a diagnosis stage to record (anything past
  // pending); resolution only once the repair is completed (or later).
  const isAssignedTechnician = !!user && repair.assigned_to === user.id;
  const canEditDiagnosis = isAssignedTechnician && !repair.is_archived && repair.status !== "pending";
  const canEditResolution =
    isAssignedTechnician && !repair.is_archived && (repair.status === "completed" || repair.status === "delivered");
  const canEditCost = hasAny(["Admin", "Receptionist"]) && !repair.is_archived;

  // Archiving: Admin only, and only once delivered/cancelled (server-enforced
  // by trg_repairs_archive_guard) — the button is simply hidden rather than
  // disabled when not eligible, same convention as everywhere else in this app.
  const canArchive = isAdmin && !repair.is_archived && (repair.status === "delivered" || repair.status === "cancelled");
  const canUnarchive = isAdmin && repair.is_archived;

  function exportPdf() {
    if (!repair) return;
    generateRepairPdf({
      order_number: repair.order_number,
      title: repair.title,
      created_at: repair.created_at,
      completed_at: repair.completed_at,
      description: repair.description,
      diagnosis: repair.diagnosis,
      resolution: repair.resolution,
      cost: repair.cost,
      machine: repair.machine,
      client: repair.client,
      technicianName: assignedTechnician ? technicianDisplayName(assignedTechnician) : null,
      logs: logs ?? [],
      parts: repairParts ?? [],
      delivery: delivery ?? null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/repairs"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileDown className="mr-2 h-4 w-4" />Export PDF
          </Button>
          {canEditMetadata && !repair.is_archived && (
            <Button asChild variant="outline" size="sm">
              <Link to="/repairs/$repairId/edit" params={{ repairId }}>
                <Pencil className="mr-2 h-4 w-4" />Edit
              </Link>
            </Button>
          )}
          {(canArchive || canUnarchive) && (
            <Button
              variant="outline"
              size="sm"
              disabled={setArchived.isPending}
              onClick={() =>
                setArchived.mutate(
                  { id: repair.id, isArchived: !repair.is_archived },
                  {
                    onSuccess: () => toast.success(repair.is_archived ? "Repair unarchived" : "Repair archived"),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              {repair.is_archived ? (
                <><ArchiveRestore className="mr-2 h-4 w-4" />Unarchive</>
              ) : (
                <><Archive className="mr-2 h-4 w-4" />Archive</>
              )}
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{repair.order_number}</div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {repair.title}
            {repair.is_archived && <Badge variant="outline">Archived</Badge>}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={repair.status} />
            <PriorityBadge priority={repair.priority} />
          </div>
        </div>
        {!repair.is_archived && (
          <div className="flex flex-wrap gap-4">
            {isTechnician && (
              <div className="w-56">
                <div className="mb-1 text-xs text-muted-foreground">Quick status change</div>
                {NEXT_STATUSES[repair.status].length === 0 ? (
                  <p className="text-xs text-muted-foreground">No further status changes.</p>
                ) : (
                  <Select
                    value={repair.status}
                    onValueChange={(v) => {
                      if (v === "delivered") {
                        setDeliveryOpen(true);
                        return;
                      }
                      updateRepair.mutate(
                        { id: repair.id, patch: { status: v as RepairStatus } },
                        { onSuccess: () => toast.success("Status updated"), onError: (e) => toast.error(e.message) },
                      );
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={repair.status}>{STATUS_LABEL[repair.status]}</SelectItem>
                      {NEXT_STATUSES[repair.status].map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {isReceptionist && repair.status === "completed" && (
              <div className="w-56">
                <div className="mb-1 text-xs text-muted-foreground">Delivery</div>
                <Button size="sm" onClick={() => setDeliveryOpen(true)}>Confirm delivery</Button>
              </div>
            )}
            <div className="w-56">
              <div className="mb-1 text-xs text-muted-foreground">Assigned technician</div>
              {canAssignAnyone ? (
                <Select
                  value={repair.assigned_to ?? "none"}
                  onValueChange={(v) =>
                    updateRepair.mutate(
                      { id: repair.id, patch: { assigned_to: v === "none" ? null : v } },
                      { onSuccess: () => toast.success("Technician assigned"), onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{technicianDisplayName(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : repair.assigned_to ? (
                // Technicians can't reassign an already-assigned repair (server-enforced
                // by trg_repairs_assignment_guard) — just show who has it.
                <p className="text-sm">{assignedTechnician ? technicianDisplayName(assignedTechnician) : "—"}</p>
              ) : (
                <Button
                  size="sm"
                  disabled={!user || updateRepair.isPending}
                  onClick={() =>
                    user &&
                    updateRepair.mutate(
                      { id: repair.id, patch: { assigned_to: user.id } },
                      { onSuccess: () => toast.success("Repair taken"), onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  Take this repair
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Client" value={
              repair.client ? (
                <Link to="/clients/$clientId" params={{ clientId: repair.client.id }} className="hover:underline">
                  {repair.client.name}
                </Link>
              ) : null
            } />
            <InfoRow label="Machine" value={
              repair.machine ? (
                <Link to="/machines/$machineId" params={{ machineId: repair.machine.id }} className="hover:underline">
                  {[repair.machine.brand, repair.machine.model].filter(Boolean).join(" ") || "Machine"}
                </Link>
              ) : null
            } />
            <InfoRow label="Intake date" value={repair.intake_date} />
            <InfoRow label="Due date" value={repair.due_date} />
            <InfoRow label="Completed" value={repair.completed_at ? new Date(repair.completed_at).toLocaleString() : null} />
            <EditableField
              label="Cost"
              displayValue={repair.cost != null ? formatCurrency(repair.cost) : null}
              canEdit={canEditCost}
              kind="number"
              initialValue={repair.cost != null ? String(repair.cost) : ""}
              submitting={updateRepair.isPending}
              onSave={(raw) =>
                updateRepair.mutate(
                  { id: repair.id, patch: { cost: raw.trim() ? Number(raw) : null } },
                  { onSuccess: () => toast.success("Cost updated"), onError: (e) => toast.error(e.message) },
                )
              }
            />
            {repair.description && (
              <div className="sm:col-span-2"><InfoRow label="Description" value={<p className="whitespace-pre-wrap">{repair.description}</p>} /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <EditableField
              label="Diagnosis"
              displayValue={repair.diagnosis ? <p className="whitespace-pre-wrap">{repair.diagnosis}</p> : null}
              canEdit={canEditDiagnosis}
              kind="textarea"
              initialValue={repair.diagnosis ?? ""}
              submitting={updateRepair.isPending}
              onSave={(raw) =>
                updateRepair.mutate(
                  { id: repair.id, patch: { diagnosis: raw.trim() || null } },
                  { onSuccess: () => toast.success("Diagnosis updated"), onError: (e) => toast.error(e.message) },
                )
              }
            />
            <EditableField
              label="Resolution"
              displayValue={repair.resolution ? <p className="whitespace-pre-wrap">{repair.resolution}</p> : null}
              canEdit={canEditResolution}
              kind="textarea"
              initialValue={repair.resolution ?? ""}
              submitting={updateRepair.isPending}
              onSave={(raw) =>
                updateRepair.mutate(
                  { id: repair.id, patch: { resolution: raw.trim() || null } },
                  { onSuccess: () => toast.success("Resolution updated"), onError: (e) => toast.error(e.message) },
                )
              }
            />
          </CardContent>
        </Card>
      </div>

      {repair.status === "delivered" && <DeliveryCard repairId={repair.id} />}

      <CustodySection
        location={repair.location}
        holder={repair.holder}
        heldSince={repair.holder ? (history?.[0]?.moved_at ?? null) : null}
        canRetrieve={!repair.is_archived && hasAny(["Admin", "Technician"])}
        canPlace={!repair.is_archived && hasAny(["Admin", "Technician"])}
        retrieveDisabledReason={repair.status === "delivered" ? "A delivered repair cannot be retrieved" : undefined}
        retrieving={retrieveRepair.isPending}
        placing={placeRepair.isPending}
        history={history}
        historyLoading={historyLoading}
        onRetrieve={() =>
          retrieveRepair.mutate(repair.id, {
            onSuccess: () => toast.success("Repair retrieved"),
            onError: (e) => toast.error(e.message),
          })
        }
        onPlace={(locationId) =>
          placeRepair.mutate(
            { id: repair.id, locationId },
            {
              onSuccess: () => toast.success("Repair placed in location"),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />

      <DiagnosticChatCard repairId={repair.id} onCopyToLog={(text) => setLogPrefill({ text })} />

      <RepairLogSection repairId={repair.id} prefill={logPrefill} />

      <RepairPartsSection repairId={repair.id} />

      <DeliveryConfirmDialog repairId={repair.id} open={deliveryOpen} onOpenChange={setDeliveryOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this repair?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete repair {repair.order_number}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteRepair.mutate(repair.id, {
                  onSuccess: () => { toast.success("Repair deleted"); navigate({ to: "/repairs" }); },
                  onError: (e) => toast.error(e.message),
                })
              }
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}