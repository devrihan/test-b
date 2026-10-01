export type BugType = "bug";
export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "open" | "resolved";

export interface Attachment {
  key: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface Issue {
  id: number;
  bug_type: BugType;
  priority: Priority;
  title: string | null;
  comments: string | null;
  status: Status;
  reporter_id: string;
  reporter_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  verified_by_id: string | null;
  verified_by_name: string | null;
  page_url: string | null;
  school_id: string;
  batch_id: string | null;
  student_id: string | null;
  exam_id: string | null;
  attachments: Attachment[];
  thread: ThreadComment[];
  student_name: string | null;
  grade: string | null;
  section: string | null;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadComment {
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

export interface IssueFilters {
  status: Status | "all";
  bug_type: BugType | "all";
  priority: Priority | "all";
  assignee: string;
  search: string;
}
