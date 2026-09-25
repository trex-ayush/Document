/** Which greeting fits the time of day: 'morning' (5–11), 'afternoon' (12–16) or 'evening'. */
export function greetingPart(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}
