export const strokeOrder = new Intl.Collator("zh-Hant-u-co-stroke", {
  numeric: true,
  sensitivity: "base",
});

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function nextPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function dateLabel(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00`));
}

export function dateRangeLabel(startDate, endDate) {
  const end = endDate || startDate;
  return startDate === end ? dateLabel(startDate) : `${dateLabel(startDate)}－${dateLabel(end)}`;
}

export function nextThursday() {
  const date = new Date();
  const days = (4 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
