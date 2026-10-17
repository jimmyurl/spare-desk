// Supabase Edge Function: user management for Spares Desk.
// Creating logins needs the service-role key, which must never be shipped in the browser,
// so the app calls this function instead. Only active Spares Desk admins may use it, and it
// can only touch people listed in spares_staff (never your other apps' users).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const ROLES = ["admin", "cashier"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth.user) return json({ error: "Not signed in" }, 401);
    const caller = auth.user;

    const { data: me } = await admin.from("spares_staff").select("role, active").eq("user_id", caller.id).maybeSingle();
    if (!me?.active || me.role !== "admin") return json({ error: "Only admins can manage users" }, 403);

    const body = await req.json().catch(() => ({}));
    const domain = (caller.email ?? "").split("@")[1];

    const activeAdmins = async (excludeId?: string) => {
      const { data } = await admin.from("spares_staff").select("user_id").eq("role", "admin").eq("active", true);
      return (data ?? []).filter((r) => r.user_id !== excludeId).length;
    };
    const target = async (id: string) => {
      const { data } = await admin.from("spares_staff").select("*").eq("user_id", id).maybeSingle();
      return data;
    };

    switch (body.action) {
      case "list": {
        const { data: rows, error } = await admin.from("spares_staff").select("*").order("created_at");
        if (error) return json({ error: error.message }, 400);
        const users = await Promise.all(
          (rows ?? []).map(async (r) => {
            const { data } = await admin.auth.admin.getUserById(r.user_id);
            return {
              user_id: r.user_id,
              username: r.username ?? (data.user?.email ?? "").split("@")[0],
              full_name: r.full_name,
              role: r.role,
              active: r.active,
              last_sign_in_at: data.user?.last_sign_in_at ?? null,
              created_at: r.created_at,
            };
          }),
        );
        return json({ users });
      }

      case "create": {
        const username = String(body.username ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        const role = String(body.role ?? "cashier");
        const full_name = String(body.full_name ?? "").trim() || null;
        if (!USERNAME.test(username)) return json({ error: "Username must be 3–30 letters, numbers, dot, dash or underscore" }, 400);
        if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
        if (!ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

        const { data: created, error } = await admin.auth.admin.createUser({
          email: `${username}@${domain}`,
          password,
          email_confirm: true,
          user_metadata: { full_name, app: "spares-desk" },
        });
        if (error || !created.user) {
          const taken = /already|registered|exists/i.test(error?.message ?? "");
          return json({ error: taken ? "That username is already taken" : (error?.message ?? "Could not create user") }, 400);
        }
        const { error: insErr } = await admin
          .from("spares_staff")
          .insert({ user_id: created.user.id, username, full_name, role, active: true });
        if (insErr) {
          await admin.auth.admin.deleteUser(created.user.id);
          return json({ error: insErr.message }, 400);
        }
        return json({ ok: true, user_id: created.user.id });
      }

      case "update": {
        const id = String(body.user_id ?? "");
        const row = await target(id);
        if (!row) return json({ error: "User not found in Spares Desk" }, 404);

        const patch: Record<string, unknown> = {};
        if (typeof body.full_name === "string") patch.full_name = body.full_name.trim() || null;
        if (body.role !== undefined) {
          if (!ROLES.includes(body.role)) return json({ error: "Invalid role" }, 400);
          patch.role = body.role;
        }
        if (typeof body.active === "boolean") patch.active = body.active;

        const losesAdmin = row.role === "admin" && row.active && (patch.role === "cashier" || patch.active === false);
        if (losesAdmin) {
          if (id === caller.id) return json({ error: "You cannot remove your own admin access" }, 400);
          if ((await activeAdmins(id)) < 1) return json({ error: "There must be at least one active admin" }, 400);
        }
        if (id === caller.id && patch.active === false) return json({ error: "You cannot deactivate yourself" }, 400);

        if (typeof body.password === "string" && body.password.length > 0) {
          if (body.password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
          const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
          if (error) return json({ error: error.message }, 400);
        }
        if (typeof patch.active === "boolean") {
          const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: patch.active ? "none" : "876000h" });
          if (error) return json({ error: error.message }, 400);
        }
        if (Object.keys(patch).length) {
          const { error } = await admin.from("spares_staff").update(patch).eq("user_id", id);
          if (error) return json({ error: error.message }, 400);
        }
        return json({ ok: true });
      }

      case "delete": {
        const id = String(body.user_id ?? "");
        const row = await target(id);
        if (!row) return json({ error: "User not found in Spares Desk" }, 404);
        if (id === caller.id) return json({ error: "You cannot delete yourself" }, 400);
        if (row.role === "admin" && row.active && (await activeAdmins(id)) < 1) {
          return json({ error: "There must be at least one active admin" }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
