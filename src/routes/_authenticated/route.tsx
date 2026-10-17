import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { emailToUsername } from "@/lib/username";
import { BarChart3, LayoutDashboard, LogOut, Package, ShoppingCart, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sell", label: "New sale", icon: ShoppingCart },
  { to: "/items", label: "Stock", icon: Package },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center gap-2 px-5 py-5 font-display text-lg font-bold text-sidebar-accent-foreground">
          <Wrench className="size-5 text-sidebar-primary" /> Spares Desk
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((n) => (
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
        <div className="mt-auto hidden border-t border-sidebar-border p-4 md:block">
          <div className="truncate text-xs text-sidebar-foreground/60">{emailToUsername(user.email)}</div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className="mt-2 flex items-center gap-2 text-sm hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <div className="stripe-accent h-1.5" />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
