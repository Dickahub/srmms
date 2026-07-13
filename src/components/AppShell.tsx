import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Wrench,
  Users,
  Package,
  MapPin,
  ClipboardList,
  BellRing,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, type AppRole } from "@/hooks/use-current-user";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Notifications is a non-critical widget in the root layout — if it breaks, fall
// back to a plain disabled bell rather than taking the whole app shell down.
function SafeNotificationsBell() {
  return (
    <ErrorBoundary
      fallback={
        <Button variant="ghost" size="icon" disabled aria-label="Notifications unavailable">
          <BellRing className="h-5 w-5 opacity-40" />
        </Button>
      }
    >
      <NotificationsBell />
    </ErrorBoundary>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/repairs", label: "Repairs", icon: Wrench },
  { to: "/clients", label: "Clients & Machines", icon: Users, roles: ["Admin", "Receptionist"] },
  { to: "/parts", label: "Inventory", icon: Package },
  { to: "/locations", label: "Storage Locations", icon: MapPin, roles: ["Admin", "Technician", "Receptionist"] },
  { to: "/audit", label: "Audit Log", icon: ClipboardList, roles: ["Admin"] },
  { to: "/notifications/log", label: "Notifications Log", icon: BellRing, roles: ["Admin", "Receptionist"] },
  { to: "/users", label: "Users", icon: Users, roles: ["Admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, roles, hasAny, loading } = useCurrentUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = NAV.filter((n) => !n.roles || hasAny(n.roles) || roles.length === 0);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-4 md:hidden">
        <img src="/secel-logo.png" alt="SECEL" className="h-6 w-auto flex-none" />
        <GlobalSearch className="max-w-none flex-1" />
        <div className="flex flex-none items-center gap-1">
          <ThemeToggle />
          <SafeNotificationsBell />
          <button
            className="rounded-md p-2 hover:bg-muted"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar — always the dark navy rail regardless of light/dark theme (the
          --sidebar tokens are identical in both :root and .dark in styles.css) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="hidden h-14 items-center gap-2 border-b border-sidebar-border px-5 md:flex">
          <img src="/secel-logo.png" alt="SECEL" className="h-7 w-auto" />
          <div className="text-lg font-semibold tracking-tight">SRMMS</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 pt-16 md:pt-3">
          {visible.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2 text-xs text-sidebar-foreground/70">
            {loading ? "…" : profile?.name || profile?.email}
            {roles.length > 0 && (
              <div className="mt-1 font-medium text-sidebar-foreground">{roles.join(", ")}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 pt-14 md:pt-0">
        <div className="sticky top-0 z-10 hidden h-14 items-center justify-between gap-4 border-b border-border bg-card/80 px-6 backdrop-blur md:flex">
          <GlobalSearch />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SafeNotificationsBell />
          </div>
        </div>
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}