export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      applications: {
        Row: {
          application_status: string
          cohort_id: string
          created_at: string | null
          currency: string | null
          current_payment_transaction_id: string | null
          discount_code: string | null
          experience_level: string
          goals: string[]
          id: string
          motivation: string
          payment_method: string
          payment_status: string
          phone_number: string
          total_amount: number | null
          updated_at: string | null
          user_email: string
          user_name: string
          user_profile_id: string | null
        }
        Insert: {
          application_status?: string
          cohort_id: string
          created_at?: string | null
          currency?: string | null
          current_payment_transaction_id?: string | null
          discount_code?: string | null
          experience_level: string
          goals?: string[]
          id?: string
          motivation: string
          payment_method?: string
          payment_status?: string
          phone_number: string
          total_amount?: number | null
          updated_at?: string | null
          user_email: string
          user_name: string
          user_profile_id?: string | null
        }
        Update: {
          application_status?: string
          cohort_id?: string
          created_at?: string | null
          currency?: string | null
          current_payment_transaction_id?: string | null
          discount_code?: string | null
          experience_level?: string
          goals?: string[]
          id?: string
          motivation?: string
          payment_method?: string
          payment_status?: string
          phone_number?: string
          total_amount?: number | null
          updated_at?: string | null
          user_email?: string
          user_name?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_current_payment_transaction_id_fkey"
            columns: ["current_payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "applications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_schemas: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          name: string
          revocable: boolean
          schema_definition: string
          schema_uid: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          name: string
          revocable?: boolean
          schema_definition: string
          schema_uid: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          revocable?: boolean
          schema_definition?: string
          schema_uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      attestations: {
        Row: {
          attestation_uid: string
          attester: string
          created_at: string
          data: Json
          expiration_time: string | null
          id: string
          is_revoked: boolean
          recipient: string
          revocation_time: string | null
          schema_uid: string
          updated_at: string
        }
        Insert: {
          attestation_uid: string
          attester: string
          created_at?: string
          data: Json
          expiration_time?: string | null
          id?: string
          is_revoked?: boolean
          recipient: string
          revocation_time?: string | null
          schema_uid: string
          updated_at?: string
        }
        Update: {
          attestation_uid?: string
          attester?: string
          created_at?: string
          data?: Json
          expiration_time?: string | null
          id?: string
          is_revoked?: boolean
          recipient?: string
          revocation_time?: string | null
          schema_uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attestations_schema_uid_fkey"
            columns: ["schema_uid"]
            isOneToOne: false
            referencedRelation: "attestation_schemas"
            referencedColumns: ["schema_uid"]
          },
        ]
      }
      bootcamp_completion_remarks: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          enrollment_id: string | null
          id: string
          remark_type: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          enrollment_id?: string | null
          id?: string
          remark_type?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          enrollment_id?: string | null
          id?: string
          remark_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bootcamp_completion_remarks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bootcamp_completion_remarks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bootcamp_completion_remarks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "bootcamp_completion_remarks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "bootcamp_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bootcamp_completion_remarks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "user_applications_view"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "bootcamp_completion_remarks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "user_enrollments_view"
            referencedColumns: ["id"]
          },
        ]
      }
      bootcamp_enrollments: {
        Row: {
          certificate_attestation_uid: string | null
          certificate_claim_in_progress: boolean | null
          certificate_image_url: string | null
          certificate_issued: boolean | null
          certificate_issued_at: string | null
          certificate_last_error: string | null
          certificate_last_error_at: string | null
          certificate_retry_count: number | null
          certificate_tx_hash: string | null
          cohort_id: string | null
          completion_date: string | null
          created_at: string
          enrollment_status: string | null
          id: string
          milestones_completed_at: string | null
          progress: Json | null
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          certificate_attestation_uid?: string | null
          certificate_claim_in_progress?: boolean | null
          certificate_image_url?: string | null
          certificate_issued?: boolean | null
          certificate_issued_at?: string | null
          certificate_last_error?: string | null
          certificate_last_error_at?: string | null
          certificate_retry_count?: number | null
          certificate_tx_hash?: string | null
          cohort_id?: string | null
          completion_date?: string | null
          created_at?: string
          enrollment_status?: string | null
          id?: string
          milestones_completed_at?: string | null
          progress?: Json | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          certificate_attestation_uid?: string | null
          certificate_claim_in_progress?: boolean | null
          certificate_image_url?: string | null
          certificate_issued?: boolean | null
          certificate_issued_at?: string | null
          certificate_last_error?: string | null
          certificate_last_error_at?: string | null
          certificate_retry_count?: number | null
          certificate_tx_hash?: string | null
          cohort_id?: string | null
          completion_date?: string | null
          created_at?: string
          enrollment_status?: string | null
          id?: string
          milestones_completed_at?: string | null
          progress?: Json | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bootcamp_enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bootcamp_enrollments_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bootcamp_enrollments_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bootcamp_programs: {
        Row: {
          created_at: string | null
          description: string
          duration_weeks: number
          grant_failure_reason: string | null
          id: string
          image_url: string | null
          lock_address: string | null
          lock_manager_granted: boolean
          max_reward_dgt: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          duration_weeks: number
          grant_failure_reason?: string | null
          id: string
          image_url?: string | null
          lock_address?: string | null
          lock_manager_granted?: boolean
          max_reward_dgt?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          duration_weeks?: number
          grant_failure_reason?: string | null
          id?: string
          image_url?: string | null
          lock_address?: string | null
          lock_manager_granted?: boolean
          max_reward_dgt?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cohort_managers: {
        Row: {
          cohort_id: string | null
          created_at: string
          id: string
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_managers_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_managers_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_managers_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_milestones: {
        Row: {
          cohort_id: string
          created_at: string | null
          description: string
          duration_hours: number | null
          end_date: string | null
          grant_failure_reason: string | null
          id: string
          lock_address: string
          lock_manager_granted: boolean
          name: string
          old_id_text: string | null
          order_index: number
          prerequisite_milestone_id: string | null
          start_date: string | null
          total_reward: number | null
          updated_at: string | null
        }
        Insert: {
          cohort_id: string
          created_at?: string | null
          description: string
          duration_hours?: number | null
          end_date?: string | null
          grant_failure_reason?: string | null
          id?: string
          lock_address: string
          lock_manager_granted?: boolean
          name: string
          old_id_text?: string | null
          order_index?: number
          prerequisite_milestone_id?: string | null
          start_date?: string | null
          total_reward?: number | null
          updated_at?: string | null
        }
        Update: {
          cohort_id?: string
          created_at?: string | null
          description?: string
          duration_hours?: number | null
          end_date?: string | null
          grant_failure_reason?: string | null
          id?: string
          lock_address?: string
          lock_manager_granted?: boolean
          name?: string
          old_id_text?: string | null
          order_index?: number
          prerequisite_milestone_id?: string | null
          start_date?: string | null
          total_reward?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_milestones_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_milestones_prerequisite_milestone_id_fkey"
            columns: ["prerequisite_milestone_id"]
            isOneToOne: false
            referencedRelation: "cohort_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          bootcamp_program_id: string
          created_at: string | null
          current_participants: number
          end_date: string
          grant_failure_reason: string | null
          id: string
          key_managers: string[] | null
          lock_address: string | null
          lock_manager_granted: boolean
          max_participants: number
          naira_amount: number | null
          name: string
          registration_deadline: string
          start_date: string
          status: string
          updated_at: string | null
          usdt_amount: number | null
        }
        Insert: {
          bootcamp_program_id: string
          created_at?: string | null
          current_participants?: number
          end_date: string
          grant_failure_reason?: string | null
          id: string
          key_managers?: string[] | null
          lock_address?: string | null
          lock_manager_granted?: boolean
          max_participants?: number
          naira_amount?: number | null
          name: string
          registration_deadline: string
          start_date: string
          status?: string
          updated_at?: string | null
          usdt_amount?: number | null
        }
        Update: {
          bootcamp_program_id?: string
          created_at?: string | null
          current_participants?: number
          end_date?: string
          grant_failure_reason?: string | null
          id?: string
          key_managers?: string[] | null
          lock_address?: string | null
          lock_manager_granted?: boolean
          max_participants?: number
          naira_amount?: number | null
          name?: string
          registration_deadline?: string
          start_date?: string
          status?: string
          updated_at?: string | null
          usdt_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_bootcamp_program_id_fkey"
            columns: ["bootcamp_program_id"]
            isOneToOne: false
            referencedRelation: "bootcamp_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      dg_token_withdrawals: {
        Row: {
          amount_dg: number
          completed_at: string | null
          created_at: string | null
          deadline: number
          error_message: string | null
          id: string
          signature: string
          status: string
          transaction_hash: string | null
          user_id: string
          user_profile_id: string | null
          wallet_address: string
          xp_balance_before: number
        }
        Insert: {
          amount_dg: number
          completed_at?: string | null
          created_at?: string | null
          deadline: number
          error_message?: string | null
          id?: string
          signature: string
          status?: string
          transaction_hash?: string | null
          user_id: string
          user_profile_id?: string | null
          wallet_address: string
          xp_balance_before: number
        }
        Update: {
          amount_dg?: number
          completed_at?: string | null
          created_at?: string | null
          deadline?: number
          error_message?: string | null
          id?: string
          signature?: string
          status?: string
          transaction_hash?: string | null
          user_id?: string
          user_profile_id?: string | null
          wallet_address?: string
          xp_balance_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "dg_token_withdrawals_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dg_token_withdrawals_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_registry: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          lock_address: string
          network: string
          purpose: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          lock_address: string
          network: string
          purpose: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          lock_address?: string
          network?: string
          purpose?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      milestone_tasks: {
        Row: {
          contract_address: string | null
          contract_method: string | null
          contract_network: string | null
          created_at: string | null
          description: string | null
          id: string
          milestone_id: string | null
          order_index: number
          requires_admin_review: boolean | null
          reward_amount: number
          submission_requirements: Json | null
          task_type: string
          title: string
          updated_at: string | null
          validation_criteria: Json | null
        }
        Insert: {
          contract_address?: string | null
          contract_method?: string | null
          contract_network?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          milestone_id?: string | null
          order_index?: number
          requires_admin_review?: boolean | null
          reward_amount?: number
          submission_requirements?: Json | null
          task_type?: string
          title: string
          updated_at?: string | null
          validation_criteria?: Json | null
        }
        Update: {
          contract_address?: string | null
          contract_method?: string | null
          contract_network?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          milestone_id?: string | null
          order_index?: number
          requires_admin_review?: boolean | null
          reward_amount?: number
          submission_requirements?: Json | null
          task_type?: string
          title?: string
          updated_at?: string | null
          validation_criteria?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "cohort_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          message: string | null
          metadata: Json | null
          read: boolean
          title: string | null
          type: string | null
          user_profile_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string | null
          type?: string | null
          user_profile_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string | null
          type?: string | null
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          amount_in_kobo: number
          application_id: string
          authorization_code: string | null
          bank: string | null
          card_type: string | null
          channel: string | null
          created_at: string | null
          currency: string
          customer_code: string | null
          fees: number | null
          id: string
          key_token_id: string | null
          metadata: Json | null
          network_chain_id: number | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string
          paystack_access_code: string | null
          paystack_gateway_response: string | null
          paystack_reference: string | null
          paystack_status: string | null
          status: string
          transaction_hash: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          amount_in_kobo: number
          application_id: string
          authorization_code?: string | null
          bank?: string | null
          card_type?: string | null
          channel?: string | null
          created_at?: string | null
          currency: string
          customer_code?: string | null
          fees?: number | null
          id?: string
          key_token_id?: string | null
          metadata?: Json | null
          network_chain_id?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference: string
          paystack_access_code?: string | null
          paystack_gateway_response?: string | null
          paystack_reference?: string | null
          paystack_status?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          amount_in_kobo?: number
          application_id?: string
          authorization_code?: string | null
          bank?: string | null
          card_type?: string | null
          channel?: string | null
          created_at?: string | null
          currency?: string
          customer_code?: string | null
          fees?: number | null
          id?: string
          key_token_id?: string | null
          metadata?: Json | null
          network_chain_id?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string
          paystack_access_code?: string | null
          paystack_gateway_response?: string | null
          paystack_reference?: string | null
          paystack_status?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_transactions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "user_applications_view"
            referencedColumns: ["application_id"]
          },
        ]
      }
      program_highlights: {
        Row: {
          cohort_id: string
          content: string
          created_at: string | null
          id: string
          order_index: number
          updated_at: string | null
        }
        Insert: {
          cohort_id: string
          content: string
          created_at?: string | null
          id?: string
          order_index?: number
          updated_at?: string | null
        }
        Update: {
          cohort_id?: string
          content?: string
          created_at?: string | null
          id?: string
          order_index?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_highlights_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      program_requirements: {
        Row: {
          cohort_id: string
          content: string
          created_at: string | null
          id: string
          order_index: number
          updated_at: string | null
        }
        Insert: {
          cohort_id: string
          content: string
          created_at?: string | null
          id?: string
          order_index?: number
          updated_at?: string | null
        }
        Update: {
          cohort_id?: string
          content?: string
          created_at?: string | null
          id?: string
          order_index?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_requirements_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_tasks: {
        Row: {
          created_at: string | null
          description: string
          id: string
          input_label: string | null
          input_placeholder: string | null
          input_required: boolean | null
          input_validation: string | null
          order_index: number
          quest_id: string
          requires_admin_review: boolean | null
          reward_amount: number
          task_type: string
          title: string
          updated_at: string | null
          verification_method: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          input_label?: string | null
          input_placeholder?: string | null
          input_required?: boolean | null
          input_validation?: string | null
          order_index?: number
          quest_id: string
          requires_admin_review?: boolean | null
          reward_amount?: number
          task_type: string
          title: string
          updated_at?: string | null
          verification_method: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          input_label?: string | null
          input_placeholder?: string | null
          input_required?: boolean | null
          input_validation?: string | null
          order_index?: number
          quest_id?: string
          requires_admin_review?: boolean | null
          reward_amount?: number
          task_type?: string
          title?: string
          updated_at?: string | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_tasks_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quest_statistics"
            referencedColumns: ["quest_id"]
          },
          {
            foreignKeyName: "quest_tasks_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          created_at: string | null
          description: string
          grant_failure_reason: string | null
          id: string
          image_url: string | null
          is_active: boolean
          lock_address: string | null
          lock_manager_granted: boolean
          title: string
          total_reward: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          grant_failure_reason?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lock_address?: string | null
          lock_manager_granted?: boolean
          title: string
          total_reward?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          grant_failure_reason?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lock_address?: string | null
          lock_manager_granted?: boolean
          title?: string
          total_reward?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      task_submissions: {
        Row: {
          created_at: string | null
          feedback: string | null
          file_urls: string[] | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submission_data: Json | null
          submission_metadata: Json | null
          submission_type: string | null
          submission_url: string | null
          submitted_at: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feedback?: string | null
          file_urls?: string[] | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_data?: Json | null
          submission_metadata?: Json | null
          submission_type?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feedback?: string | null
          file_urls?: string[] | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_data?: Json | null
          submission_metadata?: Json | null
          submission_type?: string | null
          submission_url?: string | null
          submitted_at?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "milestone_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tos_signatures: {
        Row: {
          created_at: string | null
          id: string
          message: string
          signature: string
          tos_version: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          signature: string
          tos_version?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          signature?: string
          tos_version?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      user_activities: {
        Row: {
          activity_data: Json | null
          activity_type: string
          created_at: string
          id: string
          points_earned: number | null
          user_profile_id: string | null
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          created_at?: string
          id?: string
          points_earned?: number | null
          user_profile_id?: string | null
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          created_at?: string
          id?: string
          points_earned?: number | null
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activities_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_activities_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_application_status: {
        Row: {
          amount_paid: number | null
          application_id: string | null
          completed_at: string | null
          created_at: string
          currency: string | null
          id: string
          payment_intent_id: string | null
          payment_method: string | null
          status: string | null
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          application_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          payment_intent_id?: string | null
          payment_method?: string | null
          status?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          application_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          payment_intent_id?: string | null
          payment_method?: string | null
          status?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_application_status_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "user_application_status_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_application_status_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "user_applications_view"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "user_application_status_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_application_status_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_journey_preferences: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          is_hidden: boolean
          updated_at: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_journey_preferences_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "user_journey_preferences_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "bootcamp_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_journey_preferences_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "user_applications_view"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "user_journey_preferences_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "user_enrollments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_journey_preferences_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_journey_preferences_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_milestone_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          milestone_id: string | null
          progress_percentage: number | null
          reward_amount: number | null
          reward_claimed: boolean | null
          started_at: string | null
          status: string
          tasks_completed: number | null
          total_tasks: number | null
          updated_at: string | null
          user_profile_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          progress_percentage?: number | null
          reward_amount?: number | null
          reward_claimed?: boolean | null
          started_at?: string | null
          status?: string
          tasks_completed?: number | null
          total_tasks?: number | null
          updated_at?: string | null
          user_profile_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          progress_percentage?: number | null
          reward_amount?: number | null
          reward_claimed?: boolean | null
          started_at?: string | null
          status?: string
          tasks_completed?: number | null
          total_tasks?: number | null
          updated_at?: string | null
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_milestone_progress_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "cohort_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_milestone_progress_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_milestone_progress_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_milestones: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          id: string
          key_id: string | null
          milestone_id: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          id?: string
          key_id?: string | null
          milestone_id?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          id?: string
          key_id?: string | null
          milestone_id?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_milestones_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "cohort_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          experience_points: number | null
          id: string
          level: number | null
          linked_wallets: Json | null
          metadata: Json | null
          onboarding_completed: boolean | null
          privy_user_id: string
          status: string | null
          updated_at: string
          username: string | null
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience_points?: number | null
          id?: string
          level?: number | null
          linked_wallets?: Json | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          privy_user_id: string
          status?: string | null
          updated_at?: string
          username?: string | null
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          experience_points?: number | null
          id?: string
          level?: number | null
          linked_wallets?: Json | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          privy_user_id?: string
          status?: string | null
          updated_at?: string
          username?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      user_quest_keys: {
        Row: {
          acquired_at: string | null
          id: string
          key_id: string
          quest_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          id?: string
          key_id: string
          quest_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          id?: string
          key_id?: string
          quest_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quest_keys_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quest_statistics"
            referencedColumns: ["quest_id"]
          },
          {
            foreignKeyName: "user_quest_keys_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quest_progress: {
        Row: {
          created_at: string | null
          id: string
          is_completed: boolean
          quest_id: string
          reward_claimed: boolean
          tasks_completed: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_completed?: boolean
          quest_id: string
          reward_claimed?: boolean
          tasks_completed?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_completed?: boolean
          quest_id?: string
          reward_claimed?: boolean
          tasks_completed?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quest_progress_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quest_statistics"
            referencedColumns: ["quest_id"]
          },
          {
            foreignKeyName: "user_quest_progress_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_task_completions: {
        Row: {
          admin_feedback: string | null
          completed_at: string | null
          id: string
          quest_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reward_claimed: boolean
          submission_data: Json | null
          submission_status: string | null
          task_id: string
          user_id: string
          verification_data: Json | null
        }
        Insert: {
          admin_feedback?: string | null
          completed_at?: string | null
          id?: string
          quest_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_claimed?: boolean
          submission_data?: Json | null
          submission_status?: string | null
          task_id: string
          user_id: string
          verification_data?: Json | null
        }
        Update: {
          admin_feedback?: string | null
          completed_at?: string | null
          id?: string
          quest_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_claimed?: boolean
          submission_data?: Json | null
          submission_status?: string | null
          task_id?: string
          user_id?: string
          verification_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_task_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quest_statistics"
            referencedColumns: ["quest_id"]
          },
          {
            foreignKeyName: "user_task_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "quest_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["privy_user_id"]
          },
          {
            foreignKeyName: "user_task_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["privy_user_id"]
          },
        ]
      }
      user_task_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          milestone_id: string | null
          reward_claimed: boolean | null
          status: string
          submission_id: string | null
          task_id: string
          updated_at: string | null
          user_profile_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          reward_claimed?: boolean | null
          status?: string
          submission_id?: string | null
          task_id: string
          updated_at?: string | null
          user_profile_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          milestone_id?: string | null
          reward_claimed?: boolean | null
          status?: string
          submission_id?: string | null
          task_id?: string
          updated_at?: string | null
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_progress_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "cohort_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_progress_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "task_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "milestone_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_progress_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_task_progress_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      all_applications_view: {
        Row: {
          application_created_at: string | null
          application_id: string | null
          application_status: string | null
          application_updated_at: string | null
          cohort_end_date: string | null
          cohort_id: string | null
          cohort_name: string | null
          cohort_start_date: string | null
          enrollment_created_at: string | null
          enrollment_id: string | null
          enrollment_status: string | null
          experience_level: string | null
          goals: string[] | null
          missing_enrollment: boolean | null
          missing_profile_link: boolean | null
          missing_user_status: boolean | null
          motivation: string | null
          payment_method: string | null
          payment_status: string | null
          phone_number: string | null
          privy_user_id: string | null
          profile_id: string | null
          status_created_at: string | null
          user_application_status: string | null
          user_application_status_id: string | null
          user_email: string | null
          user_name: string | null
          user_profile_id: string | null
          username: string | null
          wallet_address: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "applications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_statistics: {
        Row: {
          completed_submissions: number | null
          completed_users: number | null
          completion_rate: number | null
          failed_submissions: number | null
          pending_submissions: number | null
          quest_id: string | null
          quest_title: string | null
          total_submissions: number | null
          total_users: number | null
        }
        Relationships: []
      }
      user_applications_view: {
        Row: {
          application_id: string | null
          application_status: string | null
          cohort_end_date: string | null
          cohort_id: string | null
          cohort_name: string | null
          cohort_start_date: string | null
          created_at: string | null
          enrollment_created_at: string | null
          enrollment_id: string | null
          enrollment_status: string | null
          experience_level: string | null
          id: string | null
          payment_status: string | null
          status: string | null
          user_email: string | null
          user_name: string | null
          user_profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_enrollments_view: {
        Row: {
          bootcamp_program_id: string | null
          cohort_id: string | null
          cohort_name: string | null
          completion_date: string | null
          end_date: string | null
          enrollment_status: string | null
          id: string | null
          progress: Json | null
          start_date: string | null
          user_profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bootcamp_enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bootcamp_enrollments_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "all_applications_view"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bootcamp_enrollments_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_bootcamp_program_id_fkey"
            columns: ["bootcamp_program_id"]
            isOneToOne: false
            referencedRelation: "bootcamp_programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      award_xp_to_user: {
        Args: {
          p_activity_data: Json
          p_activity_type: string
          p_user_id: string
          p_xp_amount: number
        }
        Returns: undefined
      }
      complete_withdrawal: {
        Args: { p_tx_hash: string; p_withdrawal_id: string }
        Returns: undefined
      }
      compute_user_application_status: {
        Args: {
          application_status: string
          enrollment_status?: string
          payment_status: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_body: string
          p_metadata?: Json
          p_title: string
          p_type: string
          p_user_profile_id: string
        }
        Returns: undefined
      }
      create_notification_v2: {
        Args: {
          p_link?: string
          p_message: string
          p_title: string
          p_user_profile_id: string
        }
        Returns: undefined
      }
      exec_sql: {
        Args: { sql_query: string }
        Returns: undefined
      }
      fix_completion_status: {
        Args: { p_enrollment_id: string }
        Returns: Json
      }
      fix_orphaned_applications: {
        Args: Record<PropertyKey, never>
        Returns: {
          action_taken: string
          application_id: string
          user_email: string
        }[]
      }
      force_clear_claim_lock: {
        Args: { p_enrollment_id: string }
        Returns: Json
      }
      get_user_checkin_streak: {
        Args: { user_address: string }
        Returns: number
      }
      handle_successful_payment: {
        Args: {
          p_application_id: string
          p_payment_method: string
          p_payment_reference: string
          p_transaction_details?: Json
        }
        Returns: {
          enrollment_id: string
          message: string
          returned_application_id: string
          success: boolean
        }[]
      }
      has_checked_in_today: {
        Args: { user_address: string }
        Returns: boolean
      }
      increment_certificate_retry_count: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      initiate_withdrawal: {
        Args: {
          p_amount_dg: number
          p_deadline: number
          p_signature: string
          p_user_id: string
          p_wallet_address: string
        }
        Returns: Json
      }
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      recalculate_quest_progress: {
        Args: { p_quest_id: string; p_user_id: string }
        Returns: undefined
      }
      reconcile_all_application_statuses: {
        Args: Record<PropertyKey, never>
        Returns: {
          application_id: string
          application_status: string
          enrollment_status: string
          new_status: string
          old_status: string
          payment_status: string
          user_profile_id: string
        }[]
      }
      rollback_withdrawal: {
        Args: { p_error_message?: string; p_withdrawal_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          format: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string }
        Returns: undefined
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_prefix: {
        Args: { _bucket_id: string; _name: string }
        Returns: boolean
      }
      extension: {
        Args: { name: string }
        Returns: string
      }
      filename: {
        Args: { name: string }
        Returns: string
      }
      foldername: {
        Args: { name: string }
        Returns: string[]
      }
      get_level: {
        Args: { name: string }
        Returns: number
      }
      get_prefix: {
        Args: { name: string }
        Returns: string
      }
      get_prefixes: {
        Args: { name: string }
        Returns: string[]
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          start_after?: string
        }
        Returns: {
          id: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v1_optimised: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS"],
    },
  },
} as const

