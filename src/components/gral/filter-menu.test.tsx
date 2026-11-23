// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterMenu } from "./filter-menu";

// Every client in GRAL's book, as on the Reports page.
const clients = Array.from({ length: 300 }, (_, i) => ({ value: `CLT-${i + 1}`, label: `Client ${String(i + 1).padStart(3, "0")} Ltd` }));
clients[137] = { value: "CLT-KS", label: "Kigali Steel Industries Ltd" };

async function openMenu(options = clients) {
  const onChange = vi.fn();
  render(<FilterMenu label="Client" value={options[0]!.value} options={options} onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: /Client:/ });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  await screen.findByRole("menu");
  return onChange;
}

describe("FilterMenu with a long list", () => {
  it("shows at most 50 names and a search box", async () => {
    await openMenu();
    expect(screen.getAllByRole("menuitem")).toHaveLength(50);
    expect(screen.getByText(/Showing 50 of 300/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search client" })).toBeTruthy();
  });

  it("finds a client by part of its name and selects it", async () => {
    const onChange = await openMenu();
    fireEvent.change(screen.getByRole("textbox", { name: "Search client" }), { target: { value: "steel" } });
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Kigali Steel Industries Ltd"]);
    fireEvent.click(items[0]!);
    expect(onChange).toHaveBeenCalledWith("CLT-KS");
  });

  it("says when nothing matches", async () => {
    await openMenu();
    fireEvent.change(screen.getByRole("textbox", { name: "Search client" }), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    expect(screen.getByText(/No match for/)).toBeTruthy();
  });

  it("keeps short lists as they were, without a search box", async () => {
    await openMenu(clients.slice(0, 5));
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
