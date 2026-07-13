import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useConfirmDelivery } from "@/hooks/use-deliveries";

type Props = {
  repairId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeliveryConfirmDialog({ repairId, open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const confirm = useConfirmDelivery();

  function reset() {
    setName("");
    setPhone("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm delivery</DialogTitle>
          <DialogDescription>Record who picked up the repaired equipment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pickedUpName">Picked up by *</Label>
            <Input id="pickedUpName" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pickedUpPhone">Phone</Label>
            <Input id="pickedUpPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deliveryNotes">Notes</Label>
            <Textarea id="deliveryNotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || confirm.isPending}
            onClick={() =>
              confirm.mutate(
                { repairId, pickedUpByName: name.trim(), pickedUpByPhone: phone.trim() || null, notes: notes.trim() || null },
                {
                  onSuccess: () => { toast.success("Delivery recorded"); onOpenChange(false); reset(); },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {confirm.isPending ? "Saving…" : "Confirm delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
