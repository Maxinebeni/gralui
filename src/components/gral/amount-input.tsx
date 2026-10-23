"use client";

// An RWF amount box: groups the digits while typing (12,500,000) and spells the
// amount out underneath, so an added or missing zero is easy to see.

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { amountInWords, groupDigits, parseAmount } from "@/lib/amounts";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode"> & {
  value: string;
  onChange: (value: string) => void;
};

export function AmountInput({ value, onChange, className, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // Digits before the caret, so the caret stays put when commas are added or removed.
  const caretDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || caretDigits.current === null || document.activeElement !== input) return;
    let seen = 0;
    let pos = 0;
    while (pos < input.value.length && seen < caretDigits.current) {
      if (/\d/.test(input.value[pos]!)) seen++;
      pos++;
    }
    input.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [value]);

  const amount = parseAmount(value);
  const words = amount > 0 ? amountInWords(amount) : "";

  return (
    <>
      <input
        ref={ref}
        {...rest}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const caret = e.target.selectionStart ?? e.target.value.length;
          caretDigits.current = e.target.value.slice(0, caret).replace(/\D/g, "").length;
          onChange(groupDigits(e.target.value));
        }}
        className={cn("tabular-nums", className)}
      />
      {words ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground" aria-live="polite">
          {words} Rwandan francs
        </p>
      ) : null}
    </>
  );
}
