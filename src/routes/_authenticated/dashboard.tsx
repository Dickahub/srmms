import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDashboardData } from "@/hooks/use-dashboard";
import { REPAIR_STATUSES } from "@/hooks/use-repairs";
import { StatusBadge, PriorityBadge } from "@/components/repairs/StatusBadge";
import { AgingDot } from "@/components/repairs/AgingDot";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SRMMS" }] }),
  component: Dashboard,
});

// Fixed hue order validated for this app's card/chart surfaces (dataviz skill's
// reference categorical palette, 7-of-8 slots — see conversation notes). Kept
// separate from StatusBadge's pill colors: those are a different visual context
// (soft tinted text badges) and every segment/legend entry here is always
// paired with its text label, so the two don't need to match hex-for-hex.
const STATUS_CHART_COLORS: Record<string, { light: string; dark: string }> = {
  pending: { light: "#2a78d6", dark: "#3987e5" },
  diagnosed: { light: "#1baf7a", dark: "#199e70" },
  in_progress: { light: "#eda100", dark: "#c98500" },
  awaiting_parts: { light: "#008300", dark: "#008300" },
  completed: { light: "#4a3aa7", dark: "#9085e9" },
  delivered: { light: "#e34948", dark: "#e66767" },
  cancelled: { light: "#e87ba4", dark: "#d55181" },
};

const SINGLE_SERIES_CONFIG: ChartConfig = {
  count: { label: "Repairs", theme: { light: "#2a78d6", dark: "#3987e5" } },
};

function Dashboard() {
  const { profile, hasAny, user, loading } = useCurrentUser();
  const isPrivileged = hasAny(["Admin", "Receptionist"]);
  const data = useDashboardData();

  if (loading || data.isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome{profile?.name ? `, ${profile.name}` : ""}. This is the SRMMS control center.
        </p>
      </div>

      {isPrivileged ? (
        <FullDashboard data={data} />
      ) : (
        <TechnicianDashboard data={data} userId={user?.id} />
      )}
    </div>
  );
}

function TechnicianDashboard({ data, userId }: { data: ReturnType<typeof useDashboardData>; userId: string | undefined }) {
  const mine = data.activeRepairs.filter((r) => r.assigned_to === userId);

  return (
    <div className="space-y-6">
      <Card className="max-w-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Your active repairs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{mine.length}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Your active repairs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nothing assigned to you right now.</TableCell></TableRow>
                ) : (
                  mine.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">{r.order_number}</Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to="/repairs/$repairId" params={{ repairId: r.id }} className="hover:underline">{r.title}</Link>
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                      <TableCell><AgingDot status={r.status} priority={r.priority} updated_at={r.updated_at} /></TableCell>
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

function FullDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const navigate = useNavigate();

  const statusConfig: ChartConfig = Object.fromEntries(
    REPAIR_STATUSES.map((s) => [s, { label: data.byStatus.find((b) => b.status === s)?.label ?? s, theme: STATUS_CHART_COLORS[s] }]),
  );

  const workloadConfig: ChartConfig = {
    count: { label: "Active repairs", theme: { light: "#2a78d6", dark: "#3987e5" } },
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active repairs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data.activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting parts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data.awaitingPartsCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Low-stock parts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data.lowStockCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Held by technicians</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data.heldCount}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg. repair duration</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {data.avgDurationDays != null ? `${data.avgDurationDays.toFixed(1)} days` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Created to completion, completed/delivered repairs</p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => navigate({ to: "/repairs", search: { flagged: true } })}
          onKeyDown={(e) => { if (e.key === "Enter") navigate({ to: "/repairs", search: { flagged: true } }); }}
        >
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overdue repairs</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-2xl font-semibold">{data.overdueAmberCount}</span>
                <span className="text-xs text-muted-foreground">7+ days (3.5+ urgent)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="text-2xl font-semibold">{data.overdueRedCount}</span>
                <span className="text-xs text-muted-foreground">14+ days (7+ urgent)</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-primary">View flagged repairs →</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Repairs per month</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={SINGLE_SERIES_CONFIG} className="aspect-auto h-64 w-full">
              <BarChart data={data.perMonth} margin={{ top: 16 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" className="fill-foreground text-xs" />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Repairs by status</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={statusConfig} className="mx-auto aspect-auto h-64 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
                <Pie data={data.byStatus} dataKey="count" nameKey="status" innerRadius={48} outerRadius={80} strokeWidth={2}>
                  {data.byStatus.map((s) => (
                    <Cell key={s.status} fill={`var(--color-${s.status})`} stroke="var(--color-background, transparent)" />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="status" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Most common machine types</CardTitle></CardHeader>
          <CardContent>
            {data.topMachineTypes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No machine types recorded yet.</p>
            ) : (
              <ChartContainer config={SINGLE_SERIES_CONFIG} className="aspect-auto h-64 w-full">
                <BarChart data={data.topMachineTypes} margin={{ top: 16 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="type" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" className="fill-foreground text-xs" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Technician workload</CardTitle></CardHeader>
          <CardContent>
            {data.technicianWorkload.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No active repairs.</p>
            ) : (
              <ChartContainer
                config={workloadConfig}
                className="aspect-auto w-full"
                style={{ height: Math.max(160, data.technicianWorkload.length * 40) }}
              >
                <BarChart data={data.technicianWorkload} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" className="fill-foreground text-xs" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
