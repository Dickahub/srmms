import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuditLog } from "@/hooks/use-audit-log";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit log — SRMMS" }] }),
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const { data, isLoading } = useAuditLog({ search, entityType });
  const { hasRole, loading } = useCurrentUser();

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!hasRole("Admin")) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Only administrators can view the audit log.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every create, update and delete across the system.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by entity or actor email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="repair">Repairs</SelectItem>
            <SelectItem value="part">Parts</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="machine">Machines</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">When</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead className="w-[110px]">Entity</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No entries yet.</TableCell></TableRow>
              ) : (
                data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={e.action === "delete" ? "destructive" : e.action === "insert" ? "default" : "secondary"}>
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{e.entity_type}</TableCell>
                    <TableCell className="font-medium">{e.entity_label ?? e.entity_id}</TableCell>
                    <TableCell className="text-muted-foreground">{e.actor_email ?? "—"}</TableCell>
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