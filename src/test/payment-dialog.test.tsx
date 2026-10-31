import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentDialog } from "@/components/payment-dialog";

const { insert, errorToast } = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
  errorToast: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: errorToast } }));
vi.mock("@/lib/data", () => ({
  db: { from: () => ({ insert }) },
  useAction: (fn: () => Promise<unknown>, _success: string, onDone?: () => void) => ({
    isPending: false,
    mutate: async () => {
      await fn();
      onDone?.();
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("retains a payment draft on parent rerenders and resets it on reopen", () => {
  const props = { invoice: { id: "invoice-a", number: "INV-A" }, balance: 100, onClose: vi.fn() };
  const { rerender } = render(<PaymentDialog {...props} />);
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25" } });
  rerender(<PaymentDialog {...props} invoice={{ ...props.invoice }} />);
  expect(screen.getByLabelText("Amount")).toHaveValue(25);
  rerender(<PaymentDialog {...props} invoice={null} />);
  rerender(<PaymentDialog {...props} />);
  expect(screen.getByLabelText("Amount")).toHaveValue(100);
});

it("records an offline payment against the selected invoice", async () => {
  const onClose = vi.fn();
  render(
    <PaymentDialog
      invoice={{ id: "invoice-b", number: "INV-B" }}
      balance={10.5}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  await waitFor(() =>
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_id: "invoice-b", amount: 10.5, is_demo: false }),
    ),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it("rejects overpayment before making a database request", () => {
  render(
    <PaymentDialog invoice={{ id: "invoice-c", number: "INV-C" }} balance={10} onClose={vi.fn()} />,
  );
  const amount = screen.getByLabelText("Amount");
  fireEvent.change(amount, { target: { value: "11" } });
  fireEvent.submit(amount.closest("form")!);
  expect(errorToast).toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
