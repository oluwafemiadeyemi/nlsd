// Hand-written types matching supabase/migrations/001_schema.sql
// Run `npm run supabase:gen-types` to regenerate after schema changes.

export type WorkStatus = "draft" | "submitted" | "manager_approved" | "manager_rejected" | "approved" | "rejected";
export type AppRole = "employee" | "manager" | "finance" | "admin";
export type AuditEntity =
  | "timesheet"
  | "expense_report"
  | "leave_request"
  | "project"
  | "billing_type"
  | "hours_config"
  | "mileage_rate"
  | "directory_sync"
  | "sharepoint_sync";
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "sync_success"
  | "sync_failed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          azure_tenant_id: string | null;
          azure_user_id: string | null;
          job_title: string | null;
          department: string | null;
          office_location: string | null;
          employee_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          azure_tenant_id?: string | null;
          azure_user_id?: string | null;
          job_title?: string | null;
          department?: string | null;
          office_location?: string | null;
          employee_number?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };

      user_roles: {
        Row: {
          user_id: string;
          role: AppRole;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role: AppRole;
        };
        Update: never;
      };

      employee_manager: {
        Row: {
          employee_id: string;
          manager_id: string | null;
          updated_at: string;
        };
        Insert: {
          employee_id: string;
          manager_id?: string | null;
        };
        Update: {
          manager_id?: string | null;
        };
      };

      projects: {
        Row: {
          id: string;
          code: string;
          title: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          title: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };

      billing_types: {
        Row: {
          id: string;
          name: string;
          requires_project: boolean;
          sort_order: number;
          active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          requires_project?: boolean;
          sort_order?: number;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["billing_types"]["Insert"]>;
      };

      hours_config: {
        Row: {
          employee_id: string;
          contracted_hours: number;
          maximum_hours: number;
          updated_at: string;
        };
        Insert: {
          employee_id: string;
          contracted_hours?: number;
          maximum_hours?: number;
        };
        Update: {
          contracted_hours?: number;
          maximum_hours?: number;
        };
      };

      mileage_rate_config: {
        Row: {
          employee_id: string;
          year: number;
          rate_per_km: number;
          updated_at: string;
        };
        Insert: {
          employee_id: string;
          year: number;
          rate_per_km?: number;
        };
        Update: {
          rate_per_km?: number;
        };
      };

      holidays: {
        Row: {
          id: string;
          holiday_date: string;
          name: string;
        };
        Insert: {
          id?: string;
          holiday_date: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["holidays"]["Insert"]>;
      };

      timesheets: {
        Row: {
          id: string;
          employee_id: string;
          manager_id: string | null;
          year: number;
          month: number;
          week_number: number;
          status: WorkStatus;
          employee_notes: string | null;
          manager_comments: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          rejected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          manager_id?: string | null;
          year: number;
          month: number;
          week_number: number;
          status?: WorkStatus;
          employee_notes?: string | null;
          manager_comments?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["timesheets"]["Insert"]>;
      };

      timesheet_rows: {
        Row: {
          id: string;
          timesheet_id: string;
          billing_type_id: string;
          project_id: string | null;
          sun: number;
          mon: number;
          tue: number;
          wed: number;
          thu: number;
          fri: number;
          sat: number;
          weekly_total: number;
          sun_location: string | null;
          mon_location: string | null;
          tue_location: string | null;
          wed_location: string | null;
          thu_location: string | null;
          fri_location: string | null;
          sat_location: string | null;
        };
        Insert: {
          id?: string;
          timesheet_id: string;
          billing_type_id: string;
          project_id?: string | null;
          sun?: number;
          mon?: number;
          tue?: number;
          wed?: number;
          thu?: number;
          fri?: number;
          sat?: number;
          sun_location?: string | null;
          mon_location?: string | null;
          tue_location?: string | null;
          wed_location?: string | null;
          thu_location?: string | null;
          fri_location?: string | null;
          sat_location?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["timesheet_rows"]["Insert"]>;
      };

      expense_reports: {
        Row: {
          id: string;
          employee_id: string;
          manager_id: string | null;
          year: number;
          week_number: string;
          week_beginning_date: string;
          destination: string | null;
          status: WorkStatus;
          employee_notes: string | null;
          manager_comments: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          rejected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          manager_id?: string | null;
          year: number;
          week_number: string;
          week_beginning_date: string;
          destination?: string | null;
          status?: WorkStatus;
          employee_notes?: string | null;
          manager_comments?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["expense_reports"]["Insert"]>;
      };

      expense_entries: {
        Row: {
          id: string;
          report_id: string;
          day_index: number;
          entry_date: string;
          travel_from: string | null;
          travel_to: string | null;
          mileage_km: number;
          mileage_cost_claimed: number;
          lodging_amount: number;
          breakfast_amount: number;
          lunch_amount: number;
          dinner_amount: number;
          other_amount: number;
          other_note: string | null;
          notes: string | null;
          receipt_path: string | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          day_index: number;
          entry_date: string;
          travel_from?: string | null;
          travel_to?: string | null;
          mileage_km?: number;
          mileage_cost_claimed?: number;
          lodging_amount?: number;
          breakfast_amount?: number;
          lunch_amount?: number;
          dinner_amount?: number;
          other_amount?: number;
          other_note?: string | null;
          notes?: string | null;
          receipt_path?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["expense_entries"]["Insert"]>;
      };

      leave_requests: {
        Row: {
          id: string;
          employee_id: string;
          manager_id: string | null;
          leave_type: string;
          start_date: string;
          end_date: string;
          hours_per_day: number;
          total_hours: number;
          status: WorkStatus;
          employee_notes: string | null;
          manager_comments: string | null;
          attachment_path: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          rejected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          manager_id?: string | null;
          leave_type: string;
          start_date: string;
          end_date: string;
          hours_per_day?: number;
          total_hours?: number;
          status?: WorkStatus;
          employee_notes?: string | null;
          manager_comments?: string | null;
          attachment_path?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Insert"]>;
      };

      audit_log: {
        Row: {
          id: string;
          actor_user_id: string | null;
          entity_type: AuditEntity;
          entity_id: string | null;
          action: AuditAction;
          comment: string | null;
          before_json: Record<string, unknown> | null;
          after_json: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          entity_type: AuditEntity;
          entity_id?: string | null;
          action: AuditAction;
          comment?: string | null;
          before_json?: Record<string, unknown> | null;
          after_json?: Record<string, unknown> | null;
        };
        Update: never;
      };

      sharepoint_sync: {
        Row: {
          id: string;
          entity_type: "timesheet" | "expense_report";
          entity_id: string;
          sync_key: string;
          last_synced_at: string | null;
          last_status: "success" | "failed" | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entity_type: "timesheet" | "expense_report";
          entity_id: string;
          sync_key: string;
          last_synced_at?: string | null;
          last_status?: "success" | "failed" | null;
          last_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sharepoint_sync"]["Insert"]>;
      };
    };

    Functions: {
      has_role: {
        Args: { p_role: AppRole };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_finance: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_manager: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_manager_of: {
        Args: { p_employee_id: string };
        Returns: boolean;
      };
      my_reports: {
        Args: Record<never, never>;
        Returns: string[];
      };
      my_highest_role: {
        Args: Record<never, never>;
        Returns: AppRole;
      };
    };

    Enums: {
      work_status: WorkStatus;
      app_role: AppRole;
      audit_entity: AuditEntity;
      audit_action: AuditAction;
    };
  };
}
