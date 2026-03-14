export interface EventSummary {
  id: string;
  name: string;
  date: string;
  createdAt: string;
}

export interface AttendeeRecord {
  id: string;
  name: string;
  email: string;
  university: string | null;
  profileLink: string | null;
  emailSent: boolean;
  createdAt: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
}
