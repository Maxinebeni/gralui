import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentPreviewButton } from "./document-preview";

const api = vi.hoisted(() => ({ getDocumentContent: vi.fn(), downloadDocument: vi.fn() }));
vi.mock("@/lib/api", () => api);

afterEach(() => vi.unstubAllGlobals());

it("opens the exact file, uses its attachment name and keeps Escape within the preview", async () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:submitted-report";
    static revokeObjectURL = revoke;
  });
  api.getDocumentContent.mockResolvedValue({ blob: new Blob(["report"], { type: "application/pdf" }), fileName: "Submitted report.pdf" });
  const subject = { type: "ONBOARDING", id: "track" } as const;
  const file = { id: "report", version: 4, purpose: "RECOMMENDATION" };
  render(<DocumentPreviewButton subject={subject} document={file} />);

  const preview = screen.getByRole("button", { name: "Preview" });
  preview.focus();
  fireEvent.click(preview);
  const dialog = await screen.findByRole("dialog", { name: "Preview Submitted report.pdf" });
  expect(document.activeElement).toBe(dialog);
  expect(api.getDocumentContent).toHaveBeenCalledWith(subject, file, expect.any(AbortSignal));
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("download", "Submitted report.pdf");
  expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(preview).toHaveFocus();
  expect(revoke).toHaveBeenCalledWith("blob:submitted-report");
});
