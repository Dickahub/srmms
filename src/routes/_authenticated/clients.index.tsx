import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useClients } from "@/hooks/use-clients";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clients — SRMMS" }] }),
  component: ClientsIndex,
});

function ClientsIndex() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { hasAny } = useCurrentUser();
  const isAdmin = hasAny(["Admin"]);
  const { data: clients, isLoading } = useClients(search, { includeArchived: isAdmin && showArchived });
  const canCreate = hasAny(["Admin", "Receptionist"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">Customers and their equipment.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              New client
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, contact, email, phone…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Checkbox id="show-archived" checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />
            <Label htmlFor="show-archived" className="cursor-pointer text-sm font-normal">
              Show archived clients
            </Label>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !clients || clients.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No clients yet.</TableCell></TableRow>
              ) : (
                clients.map((c) => (
                  <TableRow key={c.id} className={c.is_active ? undefined : "opacity-60"}>
                    <TableCell className="font-medium">
                      <Link to="/clients/$clientId" params={{ clientId: c.id }} className="hover:underline">
                        {c.name}
                      </Link>
                      {!c.is_active && <Badge variant="outline" className="ml-2">Archived</Badge>}
                    </TableCell>
                    <TableCell>{c.contact_person ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}