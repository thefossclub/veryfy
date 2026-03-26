type CsvPrimitive = string | number | boolean | null | undefined;

function escapeCsvValue(value: CsvPrimitive): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCsv(headers: string[], rows: CsvPrimitive[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(","));
  return `${lines.join("\n")}\n`;
}
