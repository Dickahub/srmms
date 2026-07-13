import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUsersWithRoles, useSetUserRole, useSetTechnicianLevel,
  TECHNICIAN_LEVELS, type TechnicianLevel,
} from "@/hooks/use-users";
import { useCurrentUser, type AppRole } from "@/hooks/use-current-user";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — SRMMS" }] }),
  component: UsersPage,
});

const ROLES: AppRole[] = ["Admin", "Technician", "Receptionist"];
const LEVEL_FILTERS = ["all", ...TECHNICIAN_LEVELS, "unset"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];

function UsersPage() {
  const { hasRole, loading } = useCurrentUser();
  const { data, isLoading } = useUsersWithRoles();
  const setRole = useSetUserRole();
  const setLevel = useSetTechnicianLevel();
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  const rows = useMemo(() => {
    if (!data) return data;
    if (levelFilter === "all") return data;
    if (levelFilter === "unset") return data.filter((u) => u.roles.includes("Technician") && !u.technician_level);
    return data.filter((u) => u.technician_level === levelFilter);
  }, [data, levelFilter]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!hasRole("Admin")) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Only administrators can manage users.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Everyone with an account, their role, and technician level.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LevelFilter)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Filter by level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {TECHNICIAN_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
              <SelectItem value="unset">Technician, no level</SelectItem>
            </SelectContent>
          </Select>
          <CreateUserDialog />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[200px]">Role</TableHead>
                <TableHead className="w-[180px]">Technician level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !rows || rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No users found.</TableCell></TableRow>
              ) : (
                rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.roles[0] ?? "none"}
                        onValueChange={(v) =>
                          setRole.mutate(
                            { userId: u.id, role: v === "none" ? null : (v as AppRole) },
                            {
                              onSuccess: () => toast.success(`Role updated for ${u.name || u.email}`),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No role</SelectItem>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.roles.includes("Technician") ? (
                        <Select
                          value={u.technician_level ?? ""}
                          onValueChange={(v) =>
                            setLevel.mutate(
                              { userId: u.id, level: v as TechnicianLevel },
                              {
                                onSuccess: () => toast.success(`Level set for ${u.name || u.email}`),
                                onError: (e) => toast.error(e.message),
                              },
                            )
                          }
                        >
                          <SelectTrigger><SelectValue placeholder="Select level (required)" /></SelectTrigger>
                          <SelectContent>
                            {TECHNICIAN_LEVELS.map((l) => (
                              <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
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
