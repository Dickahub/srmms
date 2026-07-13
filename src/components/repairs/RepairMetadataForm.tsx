import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REPAIR_PRIORITIES, PRIORITY_LABEL, type Repair, type RepairPriority } from "@/hooks/use-repairs";

export type RepairMetadataInput = {
  description: string | null;
  priority: RepairPriority;
  due_date: string | null;
};

type Props = {
  initial: Repair;
  submitting?: boolean;
  onSubmit: (values: RepairMetadataInput) => void;
  onCancel?: () => void;
};

// Deliberately narrow: only description/arrival condition, priority, and due
// date (the "estimated time" to completion) are editable here. Status has its
// own controlled transition flow (the quick-status-change select on the
// repair detail page, backed by trg_repairs_status_transition), and the
// client/machine links are permanent once a repair is created — neither
// belongs on this form.
export function RepairMetadataForm({ initial, submitting, onSubmit, onCancel }: Props) {
  const [description, setDescription] = useState(initial.description ?? "");
  const [priority, setPriority] = useState<RepairPriority>(initial.priority);
  const [dueDate, setDueDate] = useState(initial.due_date ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          description: description.trim() || null,
          priority,
          due_date: dueDate || null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description / condition on arrival</Label>
          <Textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
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
          <Label htmlFor="due_date">Estimated completion (due date)</Label>
          <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
