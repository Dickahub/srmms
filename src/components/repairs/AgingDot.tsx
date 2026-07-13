import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getRepairAging, type RepairPriority, type RepairStatus } from "@/hooks/use-repairs";

type Props = {
  status: RepairStatus;
  priority: RepairPriority;
  updated_at: string;
};

// Amber past 7 days (3.5 for urgent) without an update, red past 14 (7 for urgent).
// Renders nothing for terminal statuses or repairs updated recently — see
// getRepairAging in use-repairs.ts for the exact rule (shared with the dashboard's
// overdue widget and the /repairs?flagged=true view).
export function AgingDot({ status, priority, updated_at }: Props) {
  const { level, days } = getRepairAging({ status, priority, updated_at });
  if (level === "none") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", level === "red" ? "bg-red-500" : "bg-amber-500")}
          aria-label={`No update in ${Math.floor(days)} days`}
        />
      </TooltipTrigger>
      <TooltipContent>No update in {Math.floor(days)} day{Math.floor(days) === 1 ? "" : "s"}</TooltipContent>
    </Tooltip>
  );
}
