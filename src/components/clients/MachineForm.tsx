import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/repairs/StatusBadge";
import {
  findMachineBySerial, getMachineIntakeMemory,
  type Machine, type MachineInput, type MachineIntakeMemory,
} from "@/hooks/use-machines";

type Props = {
  clientId: string;
  initial?: Partial<Machine>;
  submitting?: boolean;
  onSubmit: (values: Partial<MachineInput> & { client_id: string }) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** Create mode only: lets the caller redirect to "new repair" instead of creating a duplicate machine. */
  onUseExisting?: (machine: { id: string; client_id: string }) => void;
};

export function MachineForm({ clientId, initial, submitting, onSubmit, onCancel, submitLabel = "Save", onUseExisting }: Props) {
  const isCreateMode = !initial?.id;
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [serial, setSerial] = useState(initial?.serial_number ?? "");
  const [type, setType] = useState(initial?.machine_type ?? "");
  const [year, setYear] = useState<string>(initial?.year ? String(initial.year) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [duplicate, setDuplicate] = useState<{ clientId: string; clientName: string } | null>(null);
  const [checkingSerial, setCheckingSerial] = useState(false);

  // Intake memory: same findMachineBySerial pre-check, but on blur, and — if it
  // finds a match — enriched with the machine's repair history for the panel below.
  const [intakeMemory, setIntakeMemory] = useState<MachineIntakeMemory | null>(null);
  const [checkingIntake, setCheckingIntake] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSerialBlur() {
    if (!isCreateMode) return;
    const trimmed = serial.trim();
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (!trimmed) {
      setIntakeMemory(null);
      return;
    }
    blurTimer.current = setTimeout(async () => {
      setCheckingIntake(true);
      try {
        const existing = await findMachineBySerial(trimmed, initial?.id);
        if (!existing) {
          setIntakeMemory(null);
          return;
        }
        const memory = await getMachineIntakeMemory(existing.id);
        setIntakeMemory(memory);
        setTicketsOpen(false);
      } finally {
        setCheckingIntake(false);
      }
    }, 300);
  }

  const locked = !!intakeMemory;
  const displayBrand = locked ? (intakeMemory.machine.brand ?? "") : brand;
  const displayModel = locked ? (intakeMemory.machine.model ?? "") : model;
  const displayType = locked ? (intakeMemory.machine.machine_type ?? "") : type;
  const differentClient = locked && intakeMemory.machine.client && intakeMemory.machine.client.id !== clientId;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmedSerial = serial.trim();
        if (trimmedSerial) {
          setCheckingSerial(true);
          let existing: Awaited<ReturnType<typeof findMachineBySerial>> = null;
          try {
            existing = await findMachineBySerial(trimmedSerial, initial?.id);
          } finally {
            setCheckingSerial(false);
          }
          if (existing) {
            setDuplicate({ clientId: existing.client_id, clientName: existing.client?.name ?? "another client" });
            return;
          }
        }
        setDuplicate(null);
        onSubmit({
          client_id: clientId,
          brand: brand.trim() || null,
          model: model.trim() || null,
          serial_number: trimmedSerial || null,
          machine_type: type.trim() || null,
          year: year.trim() ? Number(year) : null,
          notes: notes.trim() || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input id="brand" value={displayBrand} disabled={locked} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" value={displayModel} disabled={locked} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serial">Serial number</Label>
          <Input
            id="serial"
            value={serial ?? ""}
            onChange={(e) => {
              setSerial(e.target.value);
              setDuplicate(null);
              setIntakeMemory(null);
            }}
            onBlur={handleSerialBlur}
          />
          {checkingIntake && <p className="text-xs text-muted-foreground">Checking existing records…</p>}
          {duplicate && (
            <p className="text-xs text-destructive">
              This serial number is already registered to{" "}
              <Link to="/clients/$clientId" params={{ clientId: duplicate.clientId }} className="font-medium underline">
                {duplicate.clientName}
              </Link>
              .
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Input
            id="type"
            value={displayType}
            disabled={locked}
            placeholder="e.g. CNC, Lathe, Press"
            onChange={(e) => setType(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input id="year" type="number" min={1900} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {intakeMemory && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-900/20">
          <p className="font-medium">This machine is already registered</p>

          {differentClient ? (
            <p className="text-destructive">
              Currently owned by{" "}
              <Link
                to="/clients/$clientId"
                params={{ clientId: intakeMemory.machine.client!.id }}
                className="font-medium underline"
              >
                {intakeMemory.machine.client!.name}
              </Link>
              , not the client selected here.
            </p>
          ) : (
            <p>
              Owned by{" "}
              {intakeMemory.machine.client ? (
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: intakeMemory.machine.client.id }}
                  className="font-medium underline"
                >
                  {intakeMemory.machine.client.name}
                </Link>
              ) : (
                "no client on file"
              )}
              .
            </p>
          )}

          <p>{intakeMemory.repairCount} repair{intakeMemory.repairCount === 1 ? "" : "s"} on file.</p>

          {intakeMemory.lastRepair && (
            <div className="rounded-md bg-background/60 p-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Last repair</div>
              <div className="flex flex-wrap items-center gap-2">
                <span>{intakeMemory.lastRepair.intake_date}</span>
                <StatusBadge status={intakeMemory.lastRepair.status} />
              </div>
              {intakeMemory.lastRepair.diagnosis && (
                <p className="mt-1 text-muted-foreground">{intakeMemory.lastRepair.diagnosis}</p>
              )}
            </div>
          )}

          {intakeMemory.repairs.length > 0 && (
            <div>
              <button
                type="button"
                className="font-medium underline"
                onClick={() => setTicketsOpen((v) => !v)}
              >
                {ticketsOpen ? "Hide" : "Show"} past tickets ({intakeMemory.repairs.length})
              </button>
              {ticketsOpen && (
                <ul className="mt-2 space-y-1">
                  {intakeMemory.repairs.map((r) => (
                    <li key={r.id}>
                      <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">
                        <span className="font-mono text-xs">{r.order_number}</span> — {r.title}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{r.intake_date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {onUseExisting && (
            <Button
              type="button"
              size="sm"
              onClick={() => onUseExisting({ id: intakeMemory.machine.id, client_id: intakeMemory.machine.client_id })}
            >
              Create repair for this machine
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting || checkingSerial || !!duplicate || locked}>
          {checkingSerial ? "Checking…" : submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
