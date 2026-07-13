import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useParts } from "@/hooks/use-parts";
import { useAddRepairPart, useRemoveRepairPart, useRepairParts } from "@/hooks/use-repair-parts";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatCurrency } from "@/lib/format-currency";

// tg_repair_parts_stock() raises "Insufficient stock for part X" before it would drive
// stock negative; the CHECK constraint (parts_quantity_on_hand_non_negative) is only a
// backstop, so fall back to a friendly message if that's what actually fired.
export function friendlyStockError(e: { message?: string; code?: string } | null | undefined): string {
  const msg = e?.message ?? "";
  if (msg.includes("Insufficient stock")) return msg;
  if (e?.code === "23514" || msg.includes("parts_quantity_on_hand_non_negative")) {
    return "Not enough stock available for this part.";
  }
  return msg || "Something went wrong.";
}

export function RepairPartsSection({ repairId }: { repairId: string }) {
  const { data: rows, isLoading } = useRepairParts(repairId);
  const { hasAny } = useCurrentUser();
  const canAdd = hasAny(["Admin", "Receptionist", "Technician"]);
  const canRemove = hasAny(["Admin", "Receptionist"]);
  const remove = useRemoveRepairPart();

  const total = useMemo(
    () => (rows ?? []).reduce((sum, r) => sum + Number(r.line_total || 0), 0),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Parts used</CardTitle>
        {canAdd && <AddPartDialog repairId={repairId} />}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Part</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows || rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No parts added yet.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.part?.sku ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.part?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity} {r.part?.unit ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.unit_price)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(r.line_total)}</TableCell>
                  <TableCell className="text-right">
                    {canRemove && (
                      <Button size="icon" variant="ghost" onClick={() =>
                        remove.mutate({ id: r.id, repair_id: repairId }, {
                          onSuccess: () => toast.success("Removed"),
                          onError: (e) => toast.error(e.message),
                        })
                      }>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
            {rows && rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-right text-sm font-medium">Parts total</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(total)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddPartDialog({ repairId }: { repairId: string }) {
  const [open, setOpen] = useState(false);
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const { data: parts } = useParts();
  const add = useAddRepairPart();

  const selected = parts?.find((p) => p.id === partId);

  function pickPart(id: string) {
    setPartId(id);
    const p = parts?.find((x) => x.id === id);
    if (p) setUnitPrice(String(p.unit_price));
  }

  function reset() {
    setPartId(""); setQuantity("1"); setUnitPrice("0");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Add part</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add part to repair</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Part</Label>
            <Select value={partId} onValueChange={pickPart}>
              <SelectTrigger><SelectValue placeholder="Select a part" /></SelectTrigger>
              <SelectContent>
                {(parts ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.quantity_on_hand <= 0}>
                    {p.name} · {p.sku} · stock {p.quantity_on_hand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {selected && Number(quantity) > selected.quantity_on_hand && (
                <p className="text-xs text-destructive">Only {selected.quantity_on_hand} in stock.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Unit price (FCFA)</Label>
              <Input id="price" type="number" min="0" step="1" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!partId || !Number(quantity) || (selected && Number(quantity) > selected.quantity_on_hand) || add.isPending}
            onClick={() =>
              add.mutate(
                { repair_id: repairId, part_id: partId, quantity: Number(quantity), unit_price: Number(unitPrice) },
                {
                  onSuccess: () => { toast.success("Part added"); setOpen(false); reset(); },
                  onError: (e) => toast.error(friendlyStockError(e)),
                },
              )
            }
          >{add.isPending ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}