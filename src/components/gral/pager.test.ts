import { describe, expect, it } from "vitest";
import { pageNumbers } from "./pager";

describe("pageNumbers", () => {
  it("shows every page when there are only a few", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
  });
  it("keeps the first, last and neighbours, with gaps", () => {
    expect(pageNumbers(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, null, 20]);
    expect(pageNumbers(20, 20)).toEqual([1, null, 19, 20]);
  });
});
