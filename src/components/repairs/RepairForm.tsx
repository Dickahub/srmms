import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/hooks/use-clients";
import { useClientMachines } from "@/hooks/use-machines";
import {
  REPAIR_PRIORITIES, REPAIR_STATUSES, PRIORITY_LABEL, STATUS_LABEL,
  type Repair, type RepairInput, type RepairPriority, type RepairStatus,
} from "@/hooks/use-repairs";

type Props = {
  initial?: Partial<Repair>;
  lockClient?: boolean;
  submitting?: boolean;
  onSubmit: (values: Partial<RepairInput> & { client_id: string; title: string }) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

// Create-only — the intake form for a brand-new repair. Editing an existing
// repair's metadata goes through RepairMetadataForm instead (a narrower form
// that excludes status, client, and machine — see repairs.$repairId.edit.tsx).
export function RepairForm({ initial, lockClient, submitting, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [machineId, setMachineId] = useState<string>(initial?.machine_id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<RepairStatus>((initial?.status as RepairStatus) ?? "pending");
  const [priority, setPriority] = useState<RepairPriority>((initial?.priority as RepairPriority) ?? "normal");
  const [intakeDate, setIntakeDate] = useState(initial?.intake_date ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");

  const { data: clients } = useClients();
  const { data: machines } = useClientMachines(clientId || undefined);

  useEffect(() => {
    // reset machine when client changes (unless it belongs to that client)
    if (!machineId) return;
    if (machines && !machines.find((m) => m.id === machineId)) setMachineId("");
  }, [clientId, machines, machineId]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clientId || !title.trim()) return;
        onSubmit({
          client_id: clientId,
          machine_id: machineId || null,
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          intake_date: intakeDate,
          due_date: dueDate || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Client *</Label>
          <Select value={clientId} onValueChange={setClientId} disabled={lockClient}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Machine</Label>
          <Select value={machineId || "none"} onValueChange={(v) => setMachineId(v === "none" ? "" : v)} disabled={!clientId}>
            <SelectTrigger><SelectValue placeholder={clientId ? "Optional" : "Select a client first"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {(machines ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {[m.brand, m.model].filter(Boolean).join(" ") || "Machine"}
                  {m.serial_number ? ` · ${m.serial_number}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as RepairStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPAIR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as RepairPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPAIR_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="intake_date">Intake date</Label>
          <Input id="intake_date" type="date" value={intakeDate} onChange={(e) => setIntakeDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due_date">Due date</Label>
          <Input id="due_date" type="date" value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting || !clientId || !title.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}