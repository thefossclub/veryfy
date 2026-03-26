export type CheckinStatus = "ok" | "already_checked_in" | "invalid_token";

export interface CheckinResponse {
  status: CheckinStatus;
  name?: string;
  event?: string;
  checkpoint?: string;
  checkedInAt?: string;
  message?: string;
}
