import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { daysAgo } from "@/lib/queries";

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const monthStart = () => {
  const n = new Date();
  return iso(new Date(n.getFullYear(), n.getMonth(), 1));
};

/** Quick period buttons + two date inputs. `onChange` receives YYYY-MM-DD strings. */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const now = new Date();
  const set = (f: Date, t: Date) => onChange(iso(f), iso(t));
  return (
    <Card className="flex flex-wrap items-end gap-2 p-4">
      <Button size="sm" variant="outline" onClick={() => set(now, now)}>Today</Button>
      <Button size="sm" variant="outline" onClick={() => set(daysAgo(6), now)}>7 days</Button>
      <Button size="sm" variant="outline" onClick={() => set(new Date(now.getFullYear(), now.getMonth(), 1), now)}>This month</Button>
      <Button size="sm" variant="outline" onClick={() => set(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0))}>Last month</Button>
      <Button size="sm" variant="outline" onClick={() => set(new Date(now.getFullYear(), 0, 1), now)}>This year</Button>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <Input type="date" className="w-40" value={from} onChange={(e) => e.target.value && onChange(e.target.value, to)} />
        –
        <Input type="date" className="w-40" value={to} onChange={(e) => e.target.value && onChange(from, e.target.value)} />
      </div>
    </Card>
  );
}
