import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocations } from "@/hooks/use-locations";
import { useHeldItems, type HeldPart, type HeldRepair } from "@/hooks/use-location-history";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/locations/")({
  head: () => ({ meta: [{ title: "Storage locations — SRMMS" }] }),
  component: LocationsIndex,
});

function LocationsIndex() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useLocations(search);
  const { hasAny } = useCurrentUser();
  const canCreate = hasAny(["Admin", "Receptionist"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Storage locations</h1>
          <p className="text-sm text-muted-foreground">Warehouses, shelves and bins.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/locations/new"><Plus className="mr-2 h-4 w-4" />New location</Link>
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or code…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">No locations yet.</TableCell></TableRow>
              ) : (
                data.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <Link to="/locations/$locationId" params={{ locationId: l.id }} className="inline-flex items-center gap-2 hover:underline">
                        <MapPin className="h-4 w-4 text-muted-foreground" />{l.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.code ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <HeldByTechnician />
    </div>
  );
}

type HolderGroup = { holder: { id: string; name: string }; repairs: HeldRepair[]; parts: HeldPart[] };

function HeldByTechnician() {
  const { data, isLoading } = useHeldItems();

  const groups = useMemo<HolderGroup[]>(() => {
    const byHolder = new Map<string, HolderGroup>();
    for (const r of data?.repairs ?? []) {
      if (!r.holder) continue;
      const g = byHolder.get(r.holder.id) ?? { holder: r.holder, repairs: [], parts: [] };
      g.repairs.push(r);
      byHolder.set(r.holder.id, g);
    }
    for (const p of data?.parts ?? []) {
      if (!p.holder) continue;
      const g = byHolder.get(p.holder.id) ?? { holder: p.holder, repairs: [], parts: [] };
      g.parts.push(p);
      byHolder.set(p.holder.id, g);
    }
    return Array.from(byHolder.values()).sort((a, b) => a.holder.name.localeCompare(b.holder.name));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Held by technician</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is currently checked out.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.holder.id}>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {g.holder.name}
                </div>
                <ul className="ml-6 list-disc space-y-1 text-sm text-muted-foreground">
                  {g.repairs.map((r) => (
                    <li key={`repair-${r.id}`}>
                      <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">
                        {r.order_number} — {r.title}
                      </Link>
                    </li>
                  ))}
                  {g.parts.map((p) => (
                    <li key={`part-${p.id}`}>
                      <Link to="/parts/$partId" params={{ partId: p.id }} className="hover:underline">
                        {p.sku} — {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}