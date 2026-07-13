import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/hooks/use-locations";
import { useUsersWithRoles, technicianDisplayName } from "@/hooks/use-users";
import type { Part, PartInput } from "@/hooks/use-parts";

type Props = {
  initial?: Partial<Part>;
  submitting?: boolean;
  onSubmit: (values: Partial<PartInput> & { sku: string; name: string }) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** "edit" hides quantity_on_hand — once a part exists, stock only changes
   * through a Stock entry (with its own record/voucher/audit trail), never a
   * freeform number edit here. */
  mode?: "create" | "edit";
};

export function PartForm({ initial, submitting, onSubmit, onCancel, submitLabel = "Save", mode = "create" }: Props) {
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "unit");
  const [unitPrice, setUnitPrice] = useState(String(initial?.unit_price ?? 0));
  const [qty, setQty] = useState(String(initial?.quantity_on_hand ?? 0));
  const [reorder, setReorder] = useState(String(initial?.reorder_level ?? 0));
  const [locationId, setLocationId] = useState(initial?.location_id ?? "");
  const [keptBy, setKeptBy] = useState(initial?.kept_by ?? "");
  const { data: locations } = useLocations();
  const { data: users } = useUsersWithRoles();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sku.trim() || !name.trim()) return;
        const payload: Partial<PartInput> & { sku: string; name: string } = {
          sku: sku.trim(),
          name: name.trim(),
          description: description?.trim() || null,
          category: category?.trim() || null,
          unit: unit.trim() || "unit",
          unit_price: Number(unitPrice) || 0,
          reorder_level: Number(reorder) || 0,
          location_id: locationId || null,
          kept_by: keptBy || null,
        };
        // quantity_on_hand is only ever set here on the create form — an initial
        // quantity > 0 auto-creates the part's first stock entry (server-side).
        // Editing an existing part never touches it; restocking goes through a
        // dedicated Stock entry instead.
        if (mode === "create") payload.quantity_on_hand = Number(qty) || 0;
        // Setting a location while the part is currently held would violate the
        // location/holder either-or CHECK — an explicit location choice here always
        // means "not held by anyone" (a brand-new part never has a holder anyway).
        if (locationId) payload.current_holder_id = null;
        onSubmit(payload);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU *</Label>
          <Input id="sku" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. FLT-1024" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={2} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input id="category" value={category ?? ""} onChange={(e) => setCategory(e.target.value)} placeholder="Filters, Belts, Motors…" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit, m, kg, box" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Unit price (FCFA)</Label>
          <Input id="price" type="number" step="1" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
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
        {mode === "create" && (
          <div className="space-y-2">
            <Label htmlFor="qty">Initial quantity</Label>
            <Input id="qty" type="number" step="1" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="reorder">Reorder level</Label>
          <Input id="reorder" type="number" step="1" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <Label htmlFor="location" className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />Storage location
        </Label>
        <Select value={locationId || "none"} onValueChange={(v) => setLocationId(v === "none" ? "" : v)}>
          <SelectTrigger id="location"><SelectValue placeholder="Select a box…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {(locations ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.code ? `${l.code} — ${l.name}` : l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Optional, but assigning a box now means this part shows up in that location's contents right away.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting || !sku.trim() || !name.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
