import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateUser, TECHNICIAN_LEVELS, type TechnicianLevel } from "@/hooks/use-users";
import type { AppRole } from "@/hooks/use-current-user";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "Technician", label: "Technician" },
  { value: "Receptionist", label: "Receptionist" },
];

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("Technician");
  const [level, setLevel] = useState<TechnicianLevel | "">("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const create = useCreateUser();

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("Technician");
    setLevel("");
    setCreated(null);
  }

  const canSubmit = !!name.trim() && !!email.trim() && password.length >= 8 && (role !== "Technician" || !!level);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />Create user
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created — share these credentials</DialogTitle>
              <DialogDescription>The password will never be shown again after this window is closed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
              <div>Email: {created.email}</div>
              <div>Password: {created.password}</div>
            </div>
            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-user-name">Full name *</Label>
                <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-email">Email *</Label>
                <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-password">Password *</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-user-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8 characters minimum"
                  />
                  <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={role} onValueChange={(v) => { setRole(v as AppRole); setLevel(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role === "Technician" && (
                <div className="space-y-2">
                  <Label>Level *</Label>
                  <Select value={level} onValueChange={(v) => setLevel(v as TechnicianLevel)}>
                    <SelectTrigger><SelectValue placeholder="Select a level" /></SelectTrigger>
                    <SelectContent>
                      {TECHNICIAN_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={!canSubmit || create.isPending}
                onClick={() =>
                  create.mutate(
                    {
                      name: name.trim(),
                      email: email.trim(),
                      password,
                      role,
                      technicianLevel: role === "Technician" ? (level as TechnicianLevel) : null,
                    },
                    {
                      onSuccess: () => {
                        toast.success("User created");
                        setCreated({ email: email.trim(), password });
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
