export interface EventSummary {
  id: string;
  name: string;
  date: string;
  createdAt: string;
}

export interface CheckpointRecord {
  id: string;
  eventId: string;
  code: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  attendeeCount: number;
  checkedInCount: number;
}

export interface AttendeeRecord {
  id: string;
  name: string;
  email: string;
  teamName: string | null;
  university: string | null;
  profileLink: string | null;
  emailSent: boolean;
  createdAt: string | null;
  checkedIn: boolean;
  checkedInCheckpointCount: number;
  checkedInAt: string | null;
}
