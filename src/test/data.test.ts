import { expect, it, vi } from "vitest";
import { fetchAllRows } from "@/lib/data";

it("reads beyond the server row limit, even when it is smaller than the requested page", async () => {
  const rows = Array.from({ length: 1505 }, (_, id) => ({ id }));
  const query = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + 500)),
    error: null,
  }));
  expect(await fetchAllRows(query)).toEqual(rows);
  expect(query).toHaveBeenLastCalledWith(1505, 2504);
});

it("does not return a partial dataset when a later page fails", async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("Network failed") });
  await expect(fetchAllRows(query)).rejects.toThrow("Network failed");
});
