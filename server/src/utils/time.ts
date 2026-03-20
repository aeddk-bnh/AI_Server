export function unixTimestampSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1_000);
}
