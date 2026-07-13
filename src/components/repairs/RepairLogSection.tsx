import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useParts } from "@/hooks/use-parts";
import { useAddRepairLog, useRepairLogs } from "@/hooks/use-repair-logs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { friendlyStockError } from "@/components/repairs/RepairPartsSection";

type Prefill = { text: string } | null;

export function RepairLogSection({ repairId, prefill }: { repairId: string; prefill?: Prefill }) {
  const { data: logs, isLoading } = useRepairLogs(repairId);
  const { hasAny } = useCurrentUser();
  const canAdd = hasAny(["Admin", "Technician"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialAction, setInitialAction] = useState<string | undefined>();

  // "Copier vers le journal" (from the diagnostic assistant) opens this dialog with
  // the AI's text pre-filled — the technician still edits and validates before saving.
  useEffect(() => {
    if (prefill) {
      setInitialAction(prefill.text);
      setDialogOpen(true);
    }
  }, [prefill]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Repair log</CardTitle>
        {canAdd && (
          <AddLogEntryDialog
            repairId={repairId}
            open={dialogOpen}
            onOpenChange={(v) => {
              setDialogOpen(v);
              if (!v) setInitialAction(undefined);
            }}
            initialAction={initialAction}
          />
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !logs || logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((entry) => (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{entry.action}</p>
                  <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
                {entry.result && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.result}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.technician?.name || "Unknown technician"}
                  {entry.time_spent_minutes != null ? ` · ${entry.time_spent_minutes} min` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type PartRow = { id: number; partId: string; quantity: string };

type AddLogEntryDialogProps = {
  repairId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAction?: string;
};

function AddLogEntryDialog({ repairId, open, onOpenChange, initialAction }: AddLogEntryDialogProps) {
  const [action, setAction] = useState(initialAction ?? "");
  const [result, setResult] = useState("");
  const [timeSpent, setTimeSpent] = useState("");
  const [partRows, setPartRows] = useState<PartRow[]>([]);
  const [nextRowId, setNextRowId] = useState(1);
  const { data: parts } = useParts();
  const add = useAddRepairLog();

  // Sync the action field from the caller's prefill whenever the dialog (re)opens —
  // covers both the external "Copier vers le journal" trigger and the plain "Add
  // entry" button (where initialAction is undefined, so this just clears it).
  useEffect(() => {
    if (open) setAction(initialAction ?? "");
  }, [open, initialAction]);

  function reset() {
    setAction("");
    setResult("");
    setTimeSpent("");
    setPartRows([]);
    setNextRowId(1);
  }

  function addPartRow() {
    setPartRows((rows) => [...rows, { id: nextRowId, partId: "", quantity: "1" }]);
    setNextRowId((n) => n + 1);
  }

  function updatePartRow(id: number, patch: Partial<PartRow>) {
    setPartRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removePartRow(id: number) {
    setPartRows((rows) => rows.filter((r) => r.id !== id));
  }

  const validRows = partRows.filter((r) => r.partId && Number(r.quantity) > 0);
  const overStockRow = validRows.find((r) => {
    const p = parts?.find((x) => x.id === r.partId);
    return p && Number(r.quantity) > p.quantity_on_hand;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Add entry</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add repair log entry</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="action">Action *</Label>
            <Textarea id="action" rows={2} value={action} onChange={(e) => setAction(e.target.value)} placeholder="What did you do?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="result">Result</Label>
            <Textarea id="result" rows={2} value={result} onChange={(e) => setResult(e.target.value)} placeholder="What happened?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="time">Time spent (minutes)</Label>
            <Input id="time" type="number" min="0" step="1" value={timeSpent} onChange={(e) => setTimeSpent(e.target.value)} className="max-w-[140px]" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parts used (optional)</Label>
              <Button type="button" size="sm" variant="outline" onClick={addPartRow}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add part
              </Button>
            </div>
            {partRows.length > 0 && (
              <div className="space-y-2">
                {partRows.map((row) => {
                  const selected = parts?.find((p) => p.id === row.partId);
                  const overStock = selected && Number(row.quantity) > selected.quantity_on_hand;
                  return (
                    <div key={row.id} className="space-y-1">
                      <div className="flex items-start gap-2">
                        <Select value={row.partId} onValueChange={(v) => updatePartRow(row.id, { partId: v })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select a part" /></SelectTrigger>
                          <SelectContent>
                            {(parts ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id} disabled={p.quantity_on_hand <= 0}>
                                {p.name} · {p.sku} · stock {p.quantity_on_hand}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="w-20">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(e) => updatePartRow(row.id, { quantity: e.target.value })}
                          />
                        </div>
                        <Button type="button" size="icon" variant="ghost" onClick={() => removePartRow(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {overStock && <p className="text-xs text-destructive">Only {selected.quantity_on_hand} in stock.</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!action.trim() || !!overStockRow || add.isPending}
            onClick={() =>
              add.mutate(
                {
                  repair_id: repairId,
                  action: action.trim(),
                  result: result.trim() || null,
                  time_spent_minutes: timeSpent.trim() ? Number(timeSpent) : null,
                  parts: validRows.map((r) => {
                    const p = parts?.find((x) => x.id === r.partId);
                    return { part_id: r.partId, quantity: Number(r.quantity), unit_price: p?.unit_price ?? 0 };
                  }),
                },
                {
                  onSuccess: (result) => {
                    if (result.partErrors.length > 0) {
                      toast.error(
                        `Log saved, but ${result.partErrors.length} part${result.partErrors.length > 1 ? "s" : ""} failed: ` +
                          result.partErrors.map((e) => friendlyStockError({ message: e.message })).join("; "),
                      );
                    } else {
                      toast.success("Log entry added");
                    }
                    onOpenChange(false);
                    reset();
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {add.isPending ? "Saving…" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
