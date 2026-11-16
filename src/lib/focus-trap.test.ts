// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { trapTab } from "./focus-trap";

function dialog() {
  document.body.innerHTML = `
    <button id="behind">Behind</button>
    <div id="d" role="dialog" aria-modal="true" tabindex="-1">
      <button id="a">A</button><button id="b">B</button>
    </div>`;
  const d = document.getElementById("d")!;
  // jsdom has no layout, so mark the buttons as visible.
  for (const el of d.querySelectorAll("button")) Object.defineProperty(el, "offsetParent", { get: () => d });
  return d;
}
const tab = (shiftKey = false) => new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });

describe("trapTab", () => {
  afterEach(() => (document.body.innerHTML = ""));

  it("wraps from the last item to the first", () => {
    const d = dialog();
    document.getElementById("b")!.focus();
    const e = tab();
    trapTab(e, d);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("a");
  });

  it("wraps from the first item back to the last with Shift+Tab", () => {
    const d = dialog();
    document.getElementById("a")!.focus();
    trapTab(tab(true), d);
    expect(document.activeElement?.id).toBe("b");
  });

  it("pulls focus back in from the page behind", () => {
    const d = dialog();
    document.getElementById("behind")!.focus();
    trapTab(tab(), d);
    expect(document.activeElement?.id).toBe("a");
  });

  it("leaves Tab alone between items in the middle", () => {
    const d = dialog();
    document.getElementById("a")!.focus();
    const e = tab();
    trapTab(e, d);
    expect(e.defaultPrevented).toBe(false);
  });
});
