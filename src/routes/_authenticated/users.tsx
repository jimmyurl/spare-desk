import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/StatCard";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/username";
import { callUsers, type Role, type StaffUser } from "@/lib/staff";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — Spares Desk" }] }),
  component: UsersPage,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const ROLE_HELP: Record<Role, string> = {
  admin: "Full access: sales, stock and prices, expenses, reports, users.",
  cashier: "Can record sales and look up stock. Cannot see profit, expenses or edit prices.",
};

function UsersPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await callUsers<{ users: StaffUser[] }>({ action: "list" })).users,
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const remove = useMutation({
    mutationFn: (u: StaffUser) => callUsers({ action: "delete", user_id: u.user_id }),
    onSuccess: () => { toast.success("User deleted"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Users" sub="Who can sign in to Spares Desk, and what they can do.">
        <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add user</Button>
      </PageHeader>

      <Card className="p-4">
        {users.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {users.error && (
          <div role="alert" className="py-6 text-center text-sm text-destructive">{(users.error as Error).message}</div>
        )}
        {users.data && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="num font-medium">{u.username}{u.user_id === user.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role}</Badge></TableCell>
                    <TableCell>{u.active ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Disabled</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("en-TZ", { dateStyle: "medium", timeStyle: "short" }) : "Never"}</TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(u)}><KeyRound className="size-3.5" /> Edit</Button>
                      {u.user_id !== user.id && (
                        <Button size="icon" variant="ghost" aria-label={`Delete ${u.username}`} onClick={() => window.confirm(`Delete ${u.username}? They will no longer be able to sign in.`) && remove.mutate(u)}>
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="space-y-1 p-4 text-sm text-muted-foreground">
        <div><b className="text-foreground">Admin</b> — {ROLE_HELP.admin}</div>
        <div><b className="text-foreground">Cashier</b> — {ROLE_HELP.cashier}</div>
      </Card>

      {adding && <AddDialog onClose={() => setAdding(false)} onDone={refresh} />}
      {editing && <EditDialog u={editing} isSelf={editing.user_id === user.id} onClose={() => setEditing(null)} onDone={refresh} />}
    </div>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [busy, setBusy] = useState(false);

  async function save() {
    const name = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(name)) return toast.error("Username: 3–30 letters, numbers, dot, dash or underscore.");
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    setBusy(true);
    try {
      await callUsers({ action: "create", username: name, full_name: fullName, password, role });
      toast.success(`User ${name} created`);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Username</Label><Input autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. neema" autoFocus /></div>
          <div className="space-y-1"><Label>Full name (optional)</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
          </div>
          <Button className="w-full" onClick={save} disabled={busy}>{busy ? "Creating…" : "Create user"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ u, isSelf, onClose, onDone }: { u: StaffUser; isSelf: boolean; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState(u.full_name ?? "");
  const [role, setRole] = useState<Role>(u.role);
  const [active, setActive] = useState(u.active);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password && password.length < 6) return toast.error("Password must be at least 6 characters.");
    setBusy(true);
    try {
      await callUsers({ action: "update", user_id: u.user_id, full_name: fullName, role, active, ...(password ? { password } : {}) });
      toast.success("Saved");
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {u.username}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-muted-foreground">{isSelf ? "You cannot change your own role." : ROLE_HELP[role]}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
            Account active (untick to block sign-in)
          </label>
          <div className="space-y-1"><Label>New password (leave empty to keep the current one)</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
