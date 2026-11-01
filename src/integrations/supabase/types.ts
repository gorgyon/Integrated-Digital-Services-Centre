export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      customer_profiles: {
        Row: {
          consent_recorded_at: string | null
          consent_to_store: boolean
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_guest: boolean
          phone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          consent_recorded_at?: string | null
          consent_to_store?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_guest?: boolean
          phone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          consent_recorded_at?: string | null
          consent_to_store?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_guest?: boolean
          phone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employment_applications: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          employer_name: string | null
          id: string
          job_title: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          employer_name?: string | null
          id?: string
          job_title: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          employer_name?: string | null
          id?: string
          job_title?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_access_grants: {
        Row: {
          approved_at: string
          approved_by: string
          expires_at: string
          file_id: string
          id: string
          purpose: string
          recipient_id: string
          revoked_at: string | null
        }
        Insert: {
          approved_at?: string
          approved_by: string
          expires_at: string
          file_id: string
          id?: string
          purpose: string
          recipient_id: string
          revoked_at?: string | null
        }
        Update: {
          approved_at?: string
          approved_by?: string
          expires_at?: string
          file_id?: string
          id?: string
          purpose?: string
          recipient_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_access_grants_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          category: Database["public"]["Enums"]["file_category"]
          created_at: string
          customer_id: string
          id: string
          mime_type: string | null
          original_name: string
          purpose: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["file_category"]
          created_at?: string
          customer_id: string
          id?: string
          mime_type?: string | null
          original_name: string
          purpose: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["file_category"]
          created_at?: string
          customer_id?: string
          id?: string
          mime_type?: string | null
          original_name?: string
          purpose?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          collected_at_centre: boolean
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          service_type: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          collected_at_centre?: boolean
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          service_type: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          collected_at_centre?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          service_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit: {
        Row: {
          action: string
          actor_id: string | null
          details: Json
          id: string
          occurred_at: string
          purpose: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          details?: Json
          id?: string
          occurred_at?: string
          purpose?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          details?: Json
          id?: string
          occurred_at?: string
          purpose?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      staff_customer_access: {
        Row: {
          customer_id: string
          granted_at: string
          granted_by: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          staff_id: string
        }
        Insert: {
          customer_id: string
          granted_at?: string
          granted_by: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          staff_id: string
        }
        Update: {
          customer_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_customer_access_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_assign_customer: {
        Args: {
          _customer: string
          _revoke?: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _staff: string
        }
        Returns: undefined
      }
      admin_set_staff_role: {
        Args: {
          _remove?: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: undefined
      }
      approve_file_access: {
        Args: {
          _expires: string
          _file: string
          _purpose: string
          _recipient: string
        }
        Returns: string
      }
      assigned_customer: {
        Args: {
          _customer: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      create_guest_customer: {
        Args: {
          _email: string
          _full_name: string
          _phone: string
          _reviewed_duplicates?: string[]
        }
        Returns: string
      }
      file_role_allowed: {
        Args: { _category: Database["public"]["Enums"]["file_category"] }
        Returns: boolean
      }
      find_possible_duplicate_customers: {
        Args: { _email: string; _phone: string }
        Returns: {
          email: string
          full_name: string
          id: string
          is_guest: boolean
          matched_on: string
          phone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalise_phone: { Args: { _phone: string }; Returns: string }
      owns_customer: { Args: { _customer: string }; Returns: boolean }
      read_authorised_file: {
        Args: { _file: string; _purpose: string }
        Returns: {
          category: Database["public"]["Enums"]["file_category"]
          created_at: string
          customer_id: string
          id: string
          mime_type: string | null
          original_name: string
          purpose: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "files"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      revoke_file_access: { Args: { _grant: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "front_desk"
        | "designer"
        | "print_operator"
        | "career_support"
        | "finance"
        | "employer"
        | "customer"
      application_status:
        | "draft"
        | "preparing"
        | "submitted"
        | "interview"
        | "outcome_received"
        | "withdrawn"
      file_category:
        | "personal"
        | "career"
        | "design_asset"
        | "approved_artwork"
        | "deliverable"
        | "internal"
      order_status:
        | "received"
        | "quoted"
        | "approved"
        | "in_production"
        | "ready_for_collection"
        | "completed"
        | "cancelled"
      payment_method: "online" | "cash_on_collection" | "cash" | "eft"
      payment_status:
        | "unpaid"
        | "pending_cash_on_collection"
        | "paid"
        | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "front_desk",
        "designer",
        "print_operator",
        "career_support",
        "finance",
        "employer",
        "customer",
      ],
      application_status: [
        "draft",
        "preparing",
        "submitted",
        "interview",
        "outcome_received",
        "withdrawn",
      ],
      file_category: [
        "personal",
        "career",
        "design_asset",
        "approved_artwork",
        "deliverable",
        "internal",
      ],
      order_status: [
        "received",
        "quoted",
        "approved",
        "in_production",
        "ready_for_collection",
        "completed",
        "cancelled",
      ],
      payment_method: ["online", "cash_on_collection", "cash", "eft"],
      payment_status: [
        "unpaid",
        "pending_cash_on_collection",
        "paid",
        "refunded",
      ],
    },
  },
} as const
