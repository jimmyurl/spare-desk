import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { emailToUsername } from "@/lib/username";
import { ADMIN_ONLY, meQuery } from "@/lib/staff";
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, Package, Receipt, ShoppingCart, TrendingUp, Users, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const me = await context.queryClient.fetchQuery({ ...meQuery, staleTime: 60_000 });
    if (me?.role === "cashier" && ADMIN_ONLY.some((p) => location.pathname.startsWith(p))) {
      throw redirect({ to: "/sell" });
    }
    return { user: data.user, me };
  },
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: true },
  { to: "/sell", label: "New sale", icon: ShoppingCart, admin: false },
  { to: "/items", label: "Stock", icon: Package, admin: false },
  { to: "/profit", label: "Profit & Loss", icon: TrendingUp, admin: true },
  { to: "/sales", label: "Sales", icon: ClipboardList, admin: true },
  { to: "/reports", label: "Sales reports", icon: BarChart3, admin: true },
  { to: "/expenses", label: "Expenses", icon: Receipt, admin: true },
  { to: "/users", label: "Users", icon: Users, admin: true },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, me } = Route.useRouteContext();
  const links = nav.filter((n) => !n.admin || me?.role === "admin");
  const name = me?.full_name || me?.username || emailToUsername(user.email);
  async function logout() {
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-5">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-sidebar-accent-foreground">
            <Wrench className="size-5 text-sidebar-primary" /> Spares Desk
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-0 text-right leading-tight">
              <div className="max-w-[10rem] truncate text-sm font-medium text-sidebar-accent-foreground">{name}</div>
              {me && <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">{me.role}</div>}
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        <div className="stripe-accent h-1" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 bg-sidebar text-sidebar-foreground md:sticky md:top-[3.75rem] md:h-[calc(100vh-3.75rem)] md:w-56">
          <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:py-4">
            {links.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:text-sidebar-primary" }}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{me ? <Outlet /> : <NoAccess />}</main>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-2xl font-bold">No access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This login is not set up for Spares Desk, or it has been deactivated. Ask the shop admin to add you under Users.
      </p>
    </div>
  );
}
