import type { ChoiceOption } from "@/lib/api";

export function ComparedQuotes({ options, selected, onChange, hint }: {
  options: ChoiceOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  const available = selected.filter((id) => options.some((option) => option.id === id));
  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-border px-3 py-2 sm:col-span-2">
      <legend className="px-1 text-xs font-medium">Quotes used in the comparison</legend>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {options.length ? options.map((option) => (
        <label key={option.id} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={selected.includes(option.id)}
            onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
          {option.name}
        </label>
      )) : <p className="text-xs text-muted-foreground">No alternative quotes available.</p>}
      {available.length !== selected.length ? (
        <div className="space-y-1 text-xs">
          <p role="status">A selected quote is no longer current.</p>
          <button type="button" className="text-primary underline underline-offset-2" onClick={() => onChange(available)}>
            Clear unavailable selections
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
