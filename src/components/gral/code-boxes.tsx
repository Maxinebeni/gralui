"use client";

// Six boxes for a 6-digit code from an authenticator app. Typing, pasting and
// the phone's one-time-code autofill all fill the boxes from left to right.

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const CODE_LENGTH = 6;

export function CodeBoxes({
  value,
  onChange,
  invalid,
  autoFocus,
  label = "Code",
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  function fill(from: number, typed: string) {
    const clean = typed.replace(/\D/g, "").slice(0, CODE_LENGTH - from);
    if (!clean) return;
    const next = [...digits];
    clean.split("").forEach((d, i) => (next[from + i] = d));
    onChange(next.join(""));
    boxes.current[Math.min(from + clean.length, CODE_LENGTH - 1)]?.focus();
  }

  function clearAt(i: number) {
    const next = [...digits];
    next[i] = "";
    // Keep the code packed to the left so "12_456" never happens.
    onChange(next.join("").slice(0, CODE_LENGTH));
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fill(i, e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) clearAt(i);
      else if (i > 0) {
        clearAt(i - 1);
        boxes.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) boxes.current[i + 1]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="flex justify-center gap-2 sm:gap-2.5"
      onPaste={(e) => {
        e.preventDefault();
        fill(0, e.clipboardData.getData("text"));
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={d}
          onChange={(e) => fill(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "size-11 rounded-xl border bg-card text-center text-lg font-semibold outline-none focus:border-sky focus:ring-2 focus:ring-sky/30 sm:size-12",
            invalid ? "border-danger" : "border-input",
          )}
        />
      ))}
    </div>
  );
}
