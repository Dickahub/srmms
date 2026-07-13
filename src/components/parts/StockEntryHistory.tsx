import { useState } from "react";
import { FileDown, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStockEntries } from "@/hooks/use-stock-entries";
import { StockEntryDialog } from "@/components/parts/StockEntryDialog";
import { generateStockEntryPdf } from "@/lib/stock-entry-pdf";

type Props = {
  partId: string;
  partName: string;
  partSku: string;
  unit: string;
  canAdd: boolean;
};

export function StockEntryHistory({ partId, partName, partSku, unit, canAdd }: Props) {
  const [open, setOpen] = useState(false);
  const { data: entries, isLoading } = useStockEntries(partId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Entry history</CardTitle>
        {canAdd && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New stock entry
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry #</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Entered by</TableHead>
              <TableHead>Kept by</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !entries || entries.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No stock entries yet.</TableCell></TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.entry_number}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.quantity} {unit}</TableCell>
                  <TableCell>{entry.enteredBy?.name ?? "—"}</TableCell>
                  <TableCell>{entry.keptBy?.name ?? "—"}</TableCell>
                  <TableCell>{entry.supplier ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Export PDF"
                      onClick={() =>
                        generateStockEntryPdf({
                          entry_number: entry.entry_number,
                          created_at: entry.created_at,
                          part_name: partName,
                          part_sku: partSku,
                          unit,
                          quantity: entry.quantity,
                          resulting_quantity_on_hand: entry.resulting_quantity_on_hand,
                          entered_by_name: entry.enteredBy?.name ?? "Unknown",
                          kept_by_name: entry.keptBy?.name ?? null,
                          supplier: entry.supplier,
                          notes: entry.notes,
                        })
                      }
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <StockEntryDialog partId={partId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
