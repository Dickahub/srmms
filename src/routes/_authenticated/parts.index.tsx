import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, AlertTriangle, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParts } from "@/hooks/use-parts";
import { useCurrentUser } from "@/hooks/use-current-user";
import { StockEntryDialog } from "@/components/parts/StockEntryDialog";
import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/parts/")({
  head: () => ({ meta: [{ title: "Inventory — SRMMS" }] }),
  component: PartsIndex,
});

function PartsIndex() {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [stockEntryPartId, setStockEntryPartId] = useState<string | null>(null);
  const { data: parts, isLoading } = useParts({ search, lowStockOnly: lowOnly });
  const { hasAny } = useCurrentUser();
  const canCreate = hasAny(["Admin", "Receptionist"]);
  const canAddStockEntry = hasAny(["Admin", "Receptionist", "Technician"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">Spare parts and stock levels.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/parts/new"><Plus className="mr-2 h-4 w-4" />New part</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, SKU, category…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant={lowOnly ? "default" : "outline"} size="sm" onClick={() => setLowOnly((v) => !v)}>
          <AlertTriangle className="mr-2 h-4 w-4" />Low stock only
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="text-right">Price</TableHead>
                {canAddStockEntry && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !parts || parts.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No parts yet.</TableCell></TableRow>
              ) : (
                parts.map((p) => {
                  const low = p.quantity_on_hand <= p.reorder_level;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">
                        <Link to="/parts/$partId" params={{ partId: p.id }} className="hover:underline">{p.name}</Link>
                      </TableCell>
                      <TableCell>{p.category ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && "text-destructive font-semibold")}>
                        {p.quantity_on_hand} {p.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.reorder_level}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.unit_price)}</TableCell>
                      {canAddStockEntry && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="New stock entry"
                            onClick={() => setStockEntryPartId(p.id)}
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {stockEntryPartId && (
        <StockEntryDialog
          partId={stockEntryPartId}
          open={!!stockEntryPartId}
          onOpenChange={(v) => { if (!v) setStockEntryPartId(null); }}
        />
      )}
    </div>
  );
}