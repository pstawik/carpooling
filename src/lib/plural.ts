/**
 * The Polish noun form for `count`: `one` for 1, `few` when the count ends in 2-4 (except 12-14),
 * `many` otherwise (0, 5-21, 25-31, …). E.g. `pluralPl(n, "miejsce", "miejsca", "miejsc")`.
 */
export function pluralPl(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

/** "0 miejsc", "1 miejsce", "2 miejsca", "5 miejsc", "22 miejsca". */
export function seatsLabel(count: number): string {
  return `${count} ${pluralPl(count, "miejsce", "miejsca", "miejsc")}`;
}
