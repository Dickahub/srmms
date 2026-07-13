import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Location, LocationInput } from "@/hooks/use-locations";

type Props = {
  initial?: Partial<Location>;
  submitting?: boolean;
  onSubmit: (values: LocationInput) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

export function LocationForm({ initial, submitting, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), code: code?.trim() || null, description: description?.trim() || null });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse A" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input id="code" value={code ?? ""} onChange={(e) => setCode(e.target.value)} placeholder="BOX-01" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}