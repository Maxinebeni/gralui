export function formatRwf(amount: number) {
  return `RWF ${amount.toLocaleString("en-US")}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}
