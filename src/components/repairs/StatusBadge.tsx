import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL, type RepairPriority, type RepairStatus } from "@/hooks/use-repairs";

const STATUS_STYLES: Record<RepairStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  diagnosed: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100",
  in_progress: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  awaiting_parts: "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  delivered: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100",
  cancelled: "bg-muted text-muted-foreground",
};

const PRIORITY_STYLES: Record<RepairPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  urgent: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

export function StatusBadge({ status }: { status: RepairStatus }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: RepairPriority }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}