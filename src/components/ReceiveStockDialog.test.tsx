import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn().mockResolvedValue({ data: "purchase-1", error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ supplier: "Mwanza Spares" }], error: null }) }) }) }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ReceiveStockDialog } from "./ReceiveStockDialog";
import { toast } from "sonner";

const items = [
  { id: "a", name: "Piston Std+ (BM150)", sku: "BMTVS-009", description: null, location: null, category: "Pistons & Engine", quantity: 10, min_quantity: 5, unit_price: 5000, cost_price: 3000 },
];

function setup() {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReceiveStockDialog items={items} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe("ReceiveStockDialog", () => {
  beforeEach(() => { rpc.mockClear(); vi.mocked(toast.error).mockClear(); });

  it("lets you receive several new parts in one delivery", async () => {
    const onClose = setup();
    fireEvent.change(screen.getByPlaceholderText("Who delivered this?"), { target: { value: "Mwanza Spares" } });

    // row 1 -> new part
    fireEvent.click(screen.getByText("New part"));
    fireEvent.change(screen.getByPlaceholderText(/Brake Light Switch/), { target: { value: "Horn (Bajaj)" } });
    const qty1 = document.querySelectorAll('input[type="number"]');
    fireEvent.change(qty1[0], { target: { value: "4" } });
    fireEvent.change(qty1[1], { target: { value: "2500" } });

    // add a second new part
    fireEvent.click(screen.getByText("Add a new part"));
    const names = screen.getAllByPlaceholderText(/Brake Light Switch/);
    fireEvent.change(names[1], { target: { value: "Bulb 12V" } });
    const nums = document.querySelectorAll('input[type="number"]');
    fireEvent.change(nums[3], { target: { value: "10" } });
    fireEvent.change(nums[4], { target: { value: "500" } });

    fireEvent.click(screen.getByText("Receive stock", { selector: "button" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0] as [string, { _supplier: string; _lines: Record<string, unknown>[] }];
    expect(fn).toBe("spares_receive_stock");
    expect(args._supplier).toBe("Mwanza Spares");
    expect(args._lines).toHaveLength(2);
    expect(args._lines[0]).toMatchObject({ name: "Horn (Bajaj)", quantity: 4, unit_cost: 2500 });
    expect(args._lines[1]).toMatchObject({ name: "Bulb 12V", quantity: 10, unit_cost: 500 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("refuses to save a row with no part chosen", async () => {
    setup();
    fireEvent.click(screen.getByText("Receive stock", { selector: "button" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a new part whose code already exists", async () => {
    setup();
    fireEvent.click(screen.getByText("New part"));
    fireEvent.change(screen.getByPlaceholderText(/Brake Light Switch/), { target: { value: "Dup" } });
    const inputs = document.querySelectorAll("input");
    const codeInput = Array.from(inputs).find((i) => i.previousElementSibling?.textContent?.includes("Code"));
    fireEvent.change(codeInput!, { target: { value: "bmtvs-009" } });
    const nums = document.querySelectorAll('input[type="number"]');
    fireEvent.change(nums[0], { target: { value: "1" } });
    fireEvent.change(nums[1], { target: { value: "1" } });
    fireEvent.click(screen.getByText("Receive stock", { selector: "button" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("already used")));
    expect(rpc).not.toHaveBeenCalled();
  });
});
