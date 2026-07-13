import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/repairs/StatusBadge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useGlobalSearch, type SearchMachineResult, type SearchRepairResult } from "@/hooks/use-global-search";
import { MachineSnapshotDialog } from "@/components/search/MachineSnapshotDialog";
import { cn } from "@/lib/utils";

export function GlobalSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const { data, isLoading } = useGlobalSearch(debounced);
  const [selected, setSelected] = useState<{ machineId: string; repairId?: string } | null>(null);

  const showDropdown = focused && debounced.trim().length >= 2;
  const machines = data?.machines ?? [];
  const repairs = data?.repairs ?? [];
  const hasResults = machines.length > 0 || repairs.length > 0;

  function selectMachine(m: SearchMachineResult) {
    setSelected({ machineId: m.id });
    setQuery("");
  }

  function selectRepair(r: SearchRepairResult) {
    if (!r.machine_id) return; // nothing to show without a machine
    setSelected({ machineId: r.machine_id, repairId: r.id });
    setQuery("");
  }

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search order # or serial #…"
        className="pl-9"
      />
      {showDropdown && (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {isLoading ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : !hasResults ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {machines.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Machines</p>
                  {machines.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectMachine(m)}
                      className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{[m.brand, m.model].filter(Boolean).join(" ") || "Machine"}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.serial_number ?? "No serial"} · {m.client?.name ?? "No client"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {repairs.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Repairs</p>
                  {repairs.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectRepair(r)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-mono text-xs">{r.order_number}</span> — {r.title}
                        <span className="block text-xs text-muted-foreground">{r.client?.name ?? "—"}</span>
                      </span>
                      <StatusBadge status={r.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selected && (
        <MachineSnapshotDialog
          machineId={selected.machineId}
          pinnedRepairId={selected.repairId}
          open={!!selected}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
        />
      )}
    </div>
  );
}
