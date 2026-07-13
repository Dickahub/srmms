import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useRepairs, useSetRepairArchived, getRepairAging, REPAIR_STATUSES, STATUS_LABEL, type RepairStatus,
} from "@/hooks/use-repairs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PriorityBadge, StatusBadge } from "@/components/repairs/StatusBadge";
import { AgingDot } from "@/components/repairs/AgingDot";

export const Route = createFileRoute("/_authenticated/repairs/")({
  head: () => ({ meta: [{ title: "Repairs — SRMMS" }] }),
  // Typed as a genuinely optional key (flagged?:), not "present but possibly
  // undefined" — otherwise TanStack Router treats `search` as required on every
  // existing <Link to="/repairs"> / navigate({ to: "/repairs" }) in the app.
  validateSearch: (s: Record<string, unknown>): { flagged?: boolean } =>
    s.flagged === true || s.flagged === "true" ? { flagged: true } : {},
  component: RepairsIndex,
});

function RepairsIndex() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RepairStatus | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const routeSearch = useSearch({ from: "/_authenticated/repairs/" });
  const flagged = routeSearch.flagged === true;
  const navigate = useNavigate();
  const { hasAny } = useCurrentUser();
  const isAdmin = hasAny(["Admin"]);
  const { data: repairsRaw, isLoading } = useRepairs({
    status: flagged ? "all" : status,
    search,
    includeArchived: isAdmin && showArchived,
  });
  const canCreate = hasAny(["Admin", "Receptionist"]);
  const setArchived = useSetRepairArchived();

  const repairs = useMemo(() => {
    if (!repairsRaw) return repairsRaw;
    if (!flagged) return repairsRaw;
    return [...repairsRaw]
      .filter((r) => getRepairAging(r).level !== "none")
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
  }, [repairsRaw, flagged]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repairs</h1>
          <p className="text-sm text-muted-foreground">All service orders and their status.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/repairs/new"><Plus className="mr-2 h-4 w-4" />New repair</Link>
          </Button>
        )}
      </div>

      {flagged ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-2 text-sm">
          <span>Showing overdue repairs, oldest update first.</span>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/repairs", search: {} })}>
            <X className="mr-2 h-4 w-4" />Clear
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order number or title…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as RepairStatus | "all")}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {REPAIR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Checkbox id="show-archived" checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />
              <Label htmlFor="show-archived" className="cursor-pointer text-sm font-normal">
                Show archived
              </Label>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Order #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Intake</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !repairs || repairs.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="py-8 text-center text-muted-foreground">No repairs found.</TableCell></TableRow>
                ) : (
                  repairs.map((r) => (
                    <TableRow key={r.id} className={r.is_archived ? "opacity-60" : undefined}>
                      <TableCell>
                        <AgingDot status={r.status} priority={r.priority} updated_at={r.updated_at} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">
                          {r.order_number}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">
                          {r.title}
                        </Link>
                        {r.is_archived && <Badge variant="outline" className="ml-2">Archived</Badge>}
                      </TableCell>
                      <TableCell>{r.client?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.machine ? [r.machine.brand, r.machine.model].filter(Boolean).join(" ") || "Machine" : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                      <TableCell className="text-muted-foreground">{r.intake_date}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          {(r.is_archived || r.status === "delivered" || r.status === "cancelled") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={r.is_archived ? "Unarchive" : "Archive"}
                              disabled={setArchived.isPending}
                              onClick={() =>
                                setArchived.mutate(
                                  { id: r.id, isArchived: !r.is_archived },
                                  {
                                    onSuccess: () => toast.success(r.is_archived ? "Repair unarchived" : "Repair archived"),
                                    onError: (e) => toast.error(e.message),
                                  },
                                )
                              }
                            >
                              {r.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
