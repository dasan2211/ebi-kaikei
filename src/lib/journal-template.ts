import { isLocalDate } from "./local-date";

const TEMPLATE_TOKEN = /\{(?:MM(?:([+-])(\d+))?|YYYY|YY|M|DD|hh|mm|ss)\}/g;

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Expands date placeholders using the accounting transaction date and time
 * placeholders using the local time at which the template is applied.
 *
 * Supported date forms are `{YYYY}`, `{YY}`, `{M}`, `{MM}`, `{DD}`, and month
 * offsets such as `{MM-1}` or `{MM+2}`. Time forms are `{hh}`, `{mm}`, `{ss}`.
 * Months wrap within 1..12, so January minus one month becomes `12`.
 */
export function expandJournalTemplate(value: string, transactionDate: string, appliedAt = new Date()): string {
  if (!isLocalDate(transactionDate)) return value;

  const year = transactionDate.slice(0, 4);
  const month = Number(transactionDate.slice(5, 7));
  const day = transactionDate.slice(8, 10);

  return value.replace(TEMPLATE_TOKEN, (token, sign: string | undefined, digits: string | undefined) => {
    if (token.startsWith("{MM")) {
      const magnitude = digits ? Number(digits) : 0;
      const offset = sign === "-" ? -magnitude : magnitude;
      const wrappedMonth = ((month - 1 + offset) % 12 + 12) % 12 + 1;
      return padTwo(wrappedMonth);
    }

    switch (token) {
      case "{YYYY}": return year;
      case "{YY}": return year.slice(2);
      case "{M}": return String(month);
      case "{DD}": return day;
      case "{hh}": return padTwo(appliedAt.getHours());
      case "{mm}": return padTwo(appliedAt.getMinutes());
      case "{ss}": return padTwo(appliedAt.getSeconds());
      default: return token;
    }
  });
}
