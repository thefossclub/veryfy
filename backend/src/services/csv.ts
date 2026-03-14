import { parse } from "csv-parse/sync";

export interface CsvAttendeeRow {
  name: string;
  email: string;
  university: string;
  profileLink: string;
}

interface RawCsvRow {
  name?: string;
  email?: string;
  university?: string;
  profile_link?: string;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseCSV(buffer: Buffer): CsvAttendeeRow[] {
  const rows = parse(buffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawCsvRow[];

  return rows.map((row, index) => {
    const name = row.name?.trim();
    const email = row.email?.trim();
    const university = row.university?.trim();
    const profileLink = row.profile_link?.trim();

    if (!name || !email || !university || !profileLink) {
      throw new Error(`Invalid CSV row at line ${index + 2}`);
    }

    if (!isValidUrl(profileLink)) {
      throw new Error(`Invalid profile_link at line ${index + 2}`);
    }

    return { name, email, university, profileLink };
  });
}
