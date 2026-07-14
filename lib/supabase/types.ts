// =============================================================================
// Supabase Database Types — Generated from supabase_schema_v2.sql
// =============================================================================

// --- Enums ---

export type AppRole = 'student' | 'guide' | 'hod' | 'pg_director' | 'dean' | 'super_admin';

export type SubmissionStatus =
  | 'submitted'
  | 'revision_requested'
  | 'guide_accepted'
  | 'guide_rejected'
  | 'hod_accepted'
  | 'hod_rejected'
  | 'finalized';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type FeedbackStatus = 'open' | 'in_progress' | 'resolved';

// --- Row Types ---

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  university_id: string | null;
  role: AppRole;
  institute_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type InstituteRow = {
  id: string;
  name: string;
  created_at: string;
};

export type DepartmentRow = {
  id: string;
  name: string;
  institute_id: string | null;
  created_at: string;
};

export type SubmissionRow = {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  criteria_details: Record<string, unknown>;
  status: SubmissionStatus;
  guide_id: string | null;
  guide_remarks: string | null;
  guide_reviewed_at: string | null;
  hod_id: string | null;
  hod_remarks: string | null;
  hod_reviewed_at: string | null;
  rejection_reason: string | null;
  edit_unlocked: boolean;
  created_at: string;
  updated_at: string;
};

export type RoleGrantRow = {
  id: string;
  email: string;
  role: AppRole;
  institute_id: string | null;
  department_id: string | null;
  can_edit: boolean;
  granted_by: string | null;
  created_at: string;
};

export type SubmissionWindowRow = {
  id: string;
  institute_id: string | null;
  start_date: string;
  end_date: string;
  created_by: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link: string | null;
  created_at: string;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  target_role: AppRole | null;
  target_institute_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  subject: string;
  message: string;
  status: FeedbackStatus;
  created_at: string;
};

export type DrugRow = {
  id: string;
  name: string;
  category: string | null;
  dosage_forms: string[] | null;
  therapeutic: string | null;
  created_at: string;
};

// --- Guide Load View ---

export type GuideLoadRow = {
  guide_id: string;
  guide_name: string;
  institute_id: string | null;
  active_count: number;
};

// --- Database Type for createClient<Database> ---

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string; email: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      institutes: {
        Row: InstituteRow;
        Insert: Partial<InstituteRow> & { name: string };
        Update: Partial<InstituteRow>;
        Relationships: [];
      };
      departments: {
        Row: DepartmentRow;
        Insert: Partial<DepartmentRow> & { name: string };
        Update: Partial<DepartmentRow>;
        Relationships: [
          {
            foreignKeyName: "departments_institute_id_fkey";
            columns: ["institute_id"];
            isOneToOne: false;
            referencedRelation: "institutes";
            referencedColumns: ["id"];
          }
        ];
      };
      submissions: {
        Row: SubmissionRow;
        Insert: Partial<SubmissionRow> & { student_id: string; title: string };
        Update: Partial<SubmissionRow>;
        Relationships: [
          {
            foreignKeyName: "submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_hod_id_fkey";
            columns: ["hod_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      role_grants: {
        Row: RoleGrantRow;
        Insert: Partial<RoleGrantRow> & { email: string; role: AppRole };
        Update: Partial<RoleGrantRow>;
        Relationships: [
          {
            foreignKeyName: "role_grants_institute_id_fkey";
            columns: ["institute_id"];
            isOneToOne: false;
            referencedRelation: "institutes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_grants_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          }
        ];
      };
      submission_window: {
        Row: SubmissionWindowRow;
        Insert: Partial<SubmissionWindowRow> & { start_date: string; end_date: string };
        Update: Partial<SubmissionWindowRow>;
        Relationships: [
          {
            foreignKeyName: "submission_window_institute_id_fkey";
            columns: ["institute_id"];
            isOneToOne: false;
            referencedRelation: "institutes";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> & { user_id: string; title: string; message: string };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      announcements: {
        Row: AnnouncementRow;
        Insert: Partial<AnnouncementRow> & { title: string; message: string };
        Update: Partial<AnnouncementRow>;
        Relationships: [
          {
            foreignKeyName: "announcements_target_institute_id_fkey";
            columns: ["target_institute_id"];
            isOneToOne: false;
            referencedRelation: "institutes";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Partial<AuditLogRow> & { action: string };
        Update: Partial<AuditLogRow>;
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      feedback: {
        Row: FeedbackRow;
        Insert: Partial<FeedbackRow> & { subject: string; message: string };
        Update: Partial<FeedbackRow>;
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      drugs: {
        Row: DrugRow;
        Insert: Partial<DrugRow> & { name: string };
        Update: Partial<DrugRow>;
        Relationships: [];
      };
    };
    Views: {
      guide_load: {
        Row: GuideLoadRow;
        Relationships: [];
      };
    };
    Functions: {
      assign_guide: {
        Args: { p_submission_id: string };
        Returns: string;
      };
      is_submission_open: {
        Args: { p_institute_id?: string };
        Returns: boolean;
      };
      get_submission_window: {
        Args: { p_institute_id?: string };
        Returns: {
          id: string;
          institute_id: string;
          start_date: string;
          end_date: string;
          days_remaining: number;
        }[];
      };
      log_audit: {
        Args: {
          p_user_id: string;
          p_action: string;
          p_table_name?: string;
          p_record_id?: string;
          p_old_data?: Record<string, unknown>;
          p_new_data?: Record<string, unknown>;
        };
        Returns: void;
      };
    };
    Enums: {
      app_role: AppRole;
      submission_status: SubmissionStatus;
      notification_type: NotificationType;
      feedback_status: FeedbackStatus;
    };
  };
}
