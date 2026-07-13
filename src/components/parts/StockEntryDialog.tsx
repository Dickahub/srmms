import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUsersWithRoles, technicianDisplayName } from "@/hooks/use-users";
import { useCreateStockEntry } from "@/hooks/use-stock-entries";

type Props = {
  partId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// entered_by is deliberately not a field here — the server always sets it to
// the logged-in user (trg_stock_entries_before_insert), regardless of role.
export function StockEntryDialog({ partId, open, onOpenChange }: Props) {
  const [quantity, setQuantity] = useState("");
  const [keptBy, setKeptBy] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const { data: users } = useUsersWithRoles();
  const create = useCreateStockEntry();

  function reset() {
    setQuantity("");
    setKeptBy("");
    setSupplier("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New stock entry</DialogTitle>
          <DialogDescription>Increases stock on hand and records a printable entry voucher.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entry-qty">Quantity *</Label>
            <Input id="entry-qty" type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Kept by</Label>
            <Select value={keptBy || "none"} onValueChange={(v) => setKeptBy(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Custodian (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{technicianDisplayName(u)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-supplier">Supplier</Label>
            <Input id="entry-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-notes">Notes</Label>
            <Textarea id="entry-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!quantity.trim() || Number(quantity) <= 0 || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  part_id: partId,
                  quantity: Number(quantity),
                  kept_by: keptBy || null,
                  supplier: supplier.trim() || null,
                  notes: notes.trim() || null,
                },
                {
                  onSuccess: () => { toast.success("Stock entry recorded"); onOpenChange(false); reset(); },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
