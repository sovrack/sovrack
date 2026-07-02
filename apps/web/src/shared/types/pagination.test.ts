import { describe, expect, it } from "vitest";
import { normalizeDataPagination } from "./pagination";

describe("normalizeDataPagination", () => {
  it("maps data/limit to items/pageSize, keeping page/total/totalPages", () => {
    const raw = {
      data: [{ id: "1" }, { id: "2" }],
      total: 42,
      page: 2,
      limit: 20,
      totalPages: 3,
    };
    expect(normalizeDataPagination(raw)).toEqual({
      items: raw.data,
      page: 2,
      pageSize: 20,
      total: 42,
      totalPages: 3,
    });
  });

  it("handles an empty page", () => {
    const raw = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    expect(normalizeDataPagination(raw)).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });
});
