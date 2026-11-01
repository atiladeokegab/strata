export function eventAtYear(events = [], year) {
  return [...events]
    .filter((event) => event.year <= year)
    .sort((a, b) => a.year - b.year || (a.stage ?? -1) - (b.stage ?? -1))
    .at(-1)
}
