import { api } from "./api";

// ─────────────────────────────────────────────────────────────
// HR service — attendance, schedules, justifications, queries,
// performance. Backed by the /api/hr router.
// ─────────────────────────────────────────────────────────────

export type DayMode = "on_site" | "remote" | "off";
export type WorkSchedule = Partial<Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  DayMode
>>;

export type AttendanceStatus =
  | "present"
  | "late"
  | "remote"
  | "absent"
  | "off"
  | "on_leave"
  | "holiday";

export interface AttendanceRecord {
  attendance_id: string;
  profile_id: string;
  work_date: string;
  expected_mode: DayMode;
  status: AttendanceStatus;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_ip: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_location_label: string | null;
  distance_from_office_m: number | null;
  is_offsite: boolean;
  late_minutes: number;
  worked_minutes: number | null;
  justification_type: "lateness" | "absence" | "offsite" | null;
  justification_note: string | null;
  justification_status: "pending" | "approved" | "rejected" | null;
  display_name?: string;
  business?: string;
  job_title?: string;
  department?: string;
}

export interface TodayAttendance {
  profile_id: string;
  work_date: string;
  expected_mode: DayMode;
  expected_start_time: string | null;
  work_location_name: string | null;
  clocked_in: boolean;
  clocked_out: boolean;
  record: AttendanceRecord | null;
}

export interface ScheduleInfo {
  profile_id: string;
  work_location_type: "on_site" | "remote" | "hybrid";
  work_schedule: WorkSchedule;
  expected_start_time: string | null;
  grace_minutes: number;
  work_location_id: string | null;
  work_location_name?: string | null;
  office_latitude?: number | null;
  office_longitude?: number | null;
  geofence_radius_m?: number | null;
  display_name?: string;
  business?: string;
}

export interface StaffQuery {
  query_id: string;
  profile_id: string;
  raised_by: string | null;
  query_type: string;
  severity: "low" | "normal" | "high";
  related_attendance_id: string | null;
  subject: string;
  details: string;
  status: "open" | "responded" | "closed" | "escalated";
  response: string | null;
  responded_at: string | null;
  resolution: string | null;
  due_date: string | null;
  created_at: string;
  display_name?: string;
}

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  target: number | null;
  score: number | null;
  weight: number;
  hint: string;
}

export interface PerformanceGoal {
  goal_id: string;
  profile_id: string;
  title: string;
  description: string | null;
  metric: string | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  weight: number;
  due_date: string | null;
  status: "active" | "achieved" | "missed" | "cancelled";
}

export interface PerformanceReview {
  review_id: string;
  profile_id: string;
  period_start: string;
  period_end: string;
  overall_rating: number | null;
  strengths: string | null;
  improvements: string | null;
  summary: string | null;
  status: "draft" | "shared" | "acknowledged";
  acknowledged_at: string | null;
}

export interface Performance {
  profile: {
    profile_id: string;
    display_name: string;
    department: string | null;
    job_title: string;
    business: string;
  };
  period: { from: string; to: string };
  kpis: Kpi[];
  overall_score: number | null;
  rating: number | null;
  attendance_summary: {
    days_attended: number;
    days_late: number;
    days_absent: number;
    scheduled_days: number;
    total_late_minutes: number;
    offsite_days: number;
  };
  goals: PerformanceGoal[];
  reviews: PerformanceReview[];
}

export interface MyHrSummary {
  profile_id: string;
  schedule: ScheduleInfo;
  today: AttendanceRecord | null;
  leave_balance: Array<{ leave_type: string; days_taken: number; entitlement?: number }>;
  open_queries: StaffQuery[];
  goals: PerformanceGoal[];
  latest_review: PerformanceReview | null;
}

export interface WorkLocation {
  location_id: string;
  business: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  is_active: boolean;
}

export interface HrOverview {
  today: string;
  counts: {
    total_staff: number;
    present_today: number;
    late_today: number;
    on_leave_today: number;
    pending_leave: number;
    pending_justifications: number;
    open_queries: number;
  };
  pending_leave: Array<Record<string, unknown>>;
  pending_justifications: AttendanceRecord[];
  open_queries: StaffQuery[];
}

// ── Geolocation capture for clock-in ──
export interface ClockGeo {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  location_label?: string;
}

// ── Self-service ──
export async function getMyHr(): Promise<MyHrSummary> {
  const { data } = await api.get("/hr/me");
  return data;
}
export async function getMyToday(): Promise<TodayAttendance> {
  const { data } = await api.get("/hr/me/today");
  return data;
}
export async function getMyAttendance(params: { from_date?: string; to_date?: string } = {}) {
  const { data } = await api.get<{ profile_id: string; data: AttendanceRecord[] }>(
    "/hr/me/attendance",
    { params },
  );
  return data;
}
export async function getMyPerformance(): Promise<Performance> {
  const { data } = await api.get("/hr/me/performance");
  return data;
}
export async function getMyQueries() {
  const { data } = await api.get<{ data: StaffQuery[] }>("/hr/me/queries");
  return data.data;
}
export async function clockIn(geo: ClockGeo): Promise<AttendanceRecord> {
  const { data } = await api.post("/hr/clock-in", geo);
  return data;
}
export async function clockOut(geo: ClockGeo): Promise<AttendanceRecord> {
  const { data } = await api.post("/hr/clock-out", geo);
  return data;
}
export async function justifyAttendance(
  id: string,
  body: { type?: string; note: string },
): Promise<AttendanceRecord> {
  const { data } = await api.post(`/hr/attendance/${id}/justify`, body);
  return data;
}
export async function respondToQuery(id: string, response: string): Promise<StaffQuery> {
  const { data } = await api.post(`/hr/queries/${id}/respond`, { response });
  return data;
}
export async function acknowledgeReview(id: string): Promise<PerformanceReview> {
  const { data } = await api.post(`/hr/reviews/${id}/acknowledge`);
  return data;
}

// ── Management ──
export async function getOverview(business?: string): Promise<HrOverview> {
  const { data } = await api.get("/hr/overview", { params: { business } });
  return data;
}
export async function listAttendance(params: {
  profile_id?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
} = {}) {
  const { data } = await api.get<{ data: AttendanceRecord[] }>("/hr/attendance", { params });
  return data.data;
}
export async function reconcileDay(date: string, business?: string) {
  const { data } = await api.post("/hr/attendance/reconcile", { date, business });
  return data;
}
export async function reviewJustification(id: string, decision: "approve" | "reject") {
  const { data } = await api.post(`/hr/attendance/${id}/justification/${decision}`);
  return data;
}
export async function getSchedule(profileId: string): Promise<ScheduleInfo> {
  const { data } = await api.get(`/hr/schedule/${profileId}`);
  return data;
}
export async function updateSchedule(
  profileId: string,
  body: Partial<ScheduleInfo>,
): Promise<ScheduleInfo> {
  const { data } = await api.put(`/hr/schedule/${profileId}`, body);
  return data;
}
export async function listWorkLocations(business?: string) {
  const { data } = await api.get<{ data: WorkLocation[] }>("/hr/work-locations", {
    params: { business },
  });
  return data.data;
}
export async function createWorkLocation(body: Partial<WorkLocation>) {
  const { data } = await api.post("/hr/work-locations", body);
  return data;
}
export async function listQueries(params: { profile_id?: string; status?: string } = {}) {
  const { data } = await api.get<{ data: StaffQuery[] }>("/hr/queries", { params });
  return data.data;
}
export async function raiseQuery(body: {
  profile_id: string;
  subject: string;
  details: string;
  query_type?: string;
  severity?: string;
  related_attendance_id?: string;
  due_date?: string;
}): Promise<StaffQuery> {
  const { data } = await api.post("/hr/queries", body);
  return data;
}
export async function resolveQuery(
  id: string,
  body: { status: "closed" | "escalated" | "open"; resolution?: string },
) {
  const { data } = await api.post(`/hr/queries/${id}/resolve`, body);
  return data;
}
export async function getPerformance(
  profileId: string,
  params: { from?: string; to?: string } = {},
): Promise<Performance> {
  const { data } = await api.get(`/hr/performance/${profileId}`, { params });
  return data;
}
export async function createGoal(profileId: string, body: Partial<PerformanceGoal>) {
  const { data } = await api.post(`/hr/performance/${profileId}/goals`, body);
  return data;
}
export async function updateGoal(goalId: string, body: Partial<PerformanceGoal>) {
  const { data } = await api.patch(`/hr/performance/goals/${goalId}`, body);
  return data;
}
export async function createReview(profileId: string, body: Partial<PerformanceReview>) {
  const { data } = await api.post(`/hr/performance/${profileId}/reviews`, body);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Leave — backed by the /api/staff/leave router (shared schema).
// Surfaced here so the HR hub and My-HR portal share one client.
// ─────────────────────────────────────────────────────────────
export type LeaveType =
  | "annual"
  | "sick"
  | "maternity"
  | "paternity"
  | "compassionate"
  | "unpaid";

export interface LeaveRequest {
  leave_id: string;
  profile_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason?: string | null;
  rejection_reason?: string | null;
  staff_name?: string;
}

export async function listLeave(params: { status?: string; profile_id?: string } = {}) {
  const { data } = await api.get<{ data: LeaveRequest[] }>("/staff/leave", { params });
  return data.data;
}
export async function getLeaveBalance(profileId: string, year?: number) {
  const { data } = await api.get(`/staff/leave/balance/${profileId}`, { params: { year } });
  return data;
}
export async function submitLeave(body: {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_requested?: number;
  reason?: string;
}): Promise<LeaveRequest> {
  const { data } = await api.post("/staff/leave", body);
  return data;
}
export async function approveLeave(id: string) {
  const { data } = await api.post(`/staff/leave/${id}/approve`);
  return data;
}
export async function rejectLeave(id: string, rejection_reason?: string) {
  const { data } = await api.post(`/staff/leave/${id}/reject`, { rejection_reason });
  return data;
}
export async function cancelLeave(id: string) {
  const { data } = await api.post(`/staff/leave/${id}/cancel`);
  return data;
}

// ── Browser geolocation helper ──
export function captureGeo(): Promise<ClockGeo> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      // Permission denied or unavailable — clock in without coords; the
      // backend records the attendance and flags missing location.
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}
