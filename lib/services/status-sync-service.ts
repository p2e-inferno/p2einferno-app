/**
 * Status Synchronization Service
 * Ensures consistency across all application-related status fields
 */

import { createClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";
import {
  PaymentStatus,
  ApplicationStatus,
  EnrollmentStatus,
  UserApplicationStatus,
  computeUserApplicationStatus,
  canTransition,
} from "../types/application-status";

const log = getLogger("services:status-sync-service");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface ApplicationStatusSync {
  applicationId: string;
  userProfileId: string;
  paymentStatus?: PaymentStatus;
  applicationStatus?: ApplicationStatus;
  enrollmentStatus?: EnrollmentStatus;
  reason?: string;
}

export class StatusSyncService {
  /**
   * Synchronize all status fields for an application
   * This is the main method to ensure consistency
   */
  static async syncApplicationStatus({
    applicationId,
    userProfileId,
    paymentStatus,
    applicationStatus,
    enrollmentStatus,
    reason = "Status synchronization",
  }: ApplicationStatusSync): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      // Get current status from all tables
      const currentStatus = await this.getCurrentStatus(
        applicationId,
        userProfileId,
      );
      if (!currentStatus.success) {
        return { success: false, error: currentStatus.error };
      }

      const current = currentStatus.data!;

      // Determine new status values
      const newPaymentStatus = paymentStatus || current.paymentStatus;
      const newApplicationStatus =
        applicationStatus || current.applicationStatus;
      const newEnrollmentStatus = enrollmentStatus || current.enrollmentStatus;

      // Validate transitions
      const validationResult = this.validateStatusTransitions(current, {
        paymentStatus: newPaymentStatus,
        applicationStatus: newApplicationStatus,
        enrollmentStatus: newEnrollmentStatus,
      });

      if (!validationResult.valid) {
        return { success: false, error: validationResult.error };
      }

      // Compute unified user application status
      const userApplicationStatus = computeUserApplicationStatus(
        newPaymentStatus,
        newApplicationStatus,
        newEnrollmentStatus,
      );

      // Begin transaction
      const updates = [];

      // Update applications table
      if (paymentStatus || applicationStatus) {
        const applicationUpdate: any = { updated_at: new Date() };
        if (paymentStatus) applicationUpdate.payment_status = paymentStatus;
        if (applicationStatus)
          applicationUpdate.application_status = applicationStatus;

        updates.push(
          supabase
            .from("applications")
            .update(applicationUpdate)
            .eq("id", applicationId),
        );
      }

      // Update user_application_status table
      const userStatusUpdate = {
        status: userApplicationStatus,
        updated_at: new Date(),
      };

      updates.push(
        supabase
          .from("user_application_status")
          .update(userStatusUpdate)
          .eq("application_id", applicationId)
          .eq("user_profile_id", userProfileId),
      );

      // Update enrollment if status provided
      if (enrollmentStatus && current.enrollmentId) {
        updates.push(
          supabase
            .from("bootcamp_enrollments")
            .update({
              enrollment_status: enrollmentStatus,
              updated_at: new Date(),
            })
            .eq("id", current.enrollmentId),
        );
      }

      // Execute all updates
      const results = await Promise.all(updates);

      // Check for errors
      for (const result of results) {
        if (result.error) {
          throw new Error(`Database update failed: ${result.error.message}`);
        }
      }

      // Log the status change
      await this.logStatusChange({
        applicationId,
        userProfileId,
        from: {
          payment: current.paymentStatus,
          application: current.applicationStatus,
          enrollment: current.enrollmentStatus,
          userStatus: current.userApplicationStatus,
        },
        to: {
          payment: newPaymentStatus,
          application: newApplicationStatus,
          enrollment: newEnrollmentStatus,
          userStatus: userApplicationStatus,
        },
        reason,
      });

      return {
        success: true,
        data: {
          applicationId,
          paymentStatus: newPaymentStatus,
          applicationStatus: newApplicationStatus,
          enrollmentStatus: newEnrollmentStatus,
          userApplicationStatus,
        },
      };
    } catch (error) {
      log.error("Status sync error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get current status from all relevant tables
   */
  private static async getCurrentStatus(
    applicationId: string,
    userProfileId: string,
  ) {
    try {
      // Get application status
      const { data: applicationData, error: appError } = await supabase
        .from("applications")
        .select("payment_status, application_status, cohort_id")
        .eq("id", applicationId)
        .single();

      if (appError)
        throw new Error(`Failed to get application: ${appError.message}`);

      // Get user application status
      const { data: userStatusData, error: userError } = await supabase
        .from("user_application_status")
        .select("status")
        .eq("application_id", applicationId)
        .eq("user_profile_id", userProfileId)
        .single();

      if (userError)
        throw new Error(`Failed to get user status: ${userError.message}`);

      // Get enrollment status (if exists)
      const { data: enrollmentData } = await supabase
        .from("bootcamp_enrollments")
        .select("id, enrollment_status")
        .eq("user_profile_id", userProfileId)
        .eq("cohort_id", applicationData.cohort_id)
        .single();

      return {
        success: true,
        data: {
          paymentStatus: applicationData.payment_status as PaymentStatus,
          applicationStatus:
            applicationData.application_status as ApplicationStatus,
          enrollmentStatus: enrollmentData?.enrollment_status as
            | EnrollmentStatus
            | undefined,
          enrollmentId: enrollmentData?.id,
          userApplicationStatus: userStatusData.status as UserApplicationStatus,
          cohortId: applicationData.cohort_id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate status transitions are allowed
   */
  private static validateStatusTransitions(
    current: any,
    proposed: {
      paymentStatus: PaymentStatus;
      applicationStatus: ApplicationStatus;
      enrollmentStatus?: EnrollmentStatus;
    },
  ): { valid: boolean; error?: string } {
    // Validate payment status transition
    if (current.paymentStatus !== proposed.paymentStatus) {
      if (
        !canTransition("payment", current.paymentStatus, proposed.paymentStatus)
      ) {
        return {
          valid: false,
          error: `Invalid payment status transition: ${current.paymentStatus} -> ${proposed.paymentStatus}`,
        };
      }
    }

    // Validate application status transition
    if (current.applicationStatus !== proposed.applicationStatus) {
      if (
        !canTransition(
          "application",
          current.applicationStatus,
          proposed.applicationStatus,
        )
      ) {
        return {
          valid: false,
          error: `Invalid application status transition: ${current.applicationStatus} -> ${proposed.applicationStatus}`,
        };
      }
    }

    // Validate enrollment status transition (if applicable)
    if (
      proposed.enrollmentStatus &&
      current.enrollmentStatus !== proposed.enrollmentStatus
    ) {
      if (
        !canTransition(
          "enrollment",
          current.enrollmentStatus,
          proposed.enrollmentStatus,
        )
      ) {
        return {
          valid: false,
          error: `Invalid enrollment status transition: ${current.enrollmentStatus} -> ${proposed.enrollmentStatus}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Log status changes for audit trail
   */
  private static async logStatusChange(change: {
    applicationId: string;
    userProfileId: string;
    from: any;
    to: any;
    reason: string;
  }) {
    try {
      await supabase.from("user_activities").insert({
        user_profile_id: change.userProfileId,
        activity_type: "status_change",
        activity_data: {
          application_id: change.applicationId,
          from: change.from,
          to: change.to,
          reason: change.reason,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      log.error("Failed to log status change:", error);
      // Don't fail the main operation if logging fails
    }
  }

  /**
   * Fix inconsistent statuses across the system
   * This method can be used to resolve data inconsistencies
   */
  static async reconcileApplicationStatus(
    applicationId: string,
    userProfileId: string,
  ) {
    try {
      const currentStatus = await this.getCurrentStatus(
        applicationId,
        userProfileId,
      );
      if (!currentStatus.success) {
        return { success: false, error: currentStatus.error };
      }

      const current = currentStatus.data!;

      // Compute what the user application status should be
      const correctUserStatus = computeUserApplicationStatus(
        current.paymentStatus,
        current.applicationStatus,
        current.enrollmentStatus,
      );

      // If it doesn't match current, sync it
      if (current.userApplicationStatus !== correctUserStatus) {
        await supabase
          .from("user_application_status")
          .update({
            status: correctUserStatus,
            updated_at: new Date(),
          })
          .eq("application_id", applicationId)
          .eq("user_profile_id", userProfileId);
      }

      // If payment is completed but no enrollment exists, create one
      if (
        current.paymentStatus === "completed" &&
        current.applicationStatus === "approved" &&
        !current.enrollmentStatus
      ) {
        const { error: enrollmentError } = await supabase
          .from("bootcamp_enrollments")
          .insert({
            user_profile_id: userProfileId,
            cohort_id: current.cohortId,
            enrollment_status: "active",
          })
          .select()
          .single();

        if (enrollmentError) {
          throw new Error(
            `Failed to create enrollment: ${enrollmentError.message}`,
          );
        }

        // Update user status to enrolled
        await supabase
          .from("user_application_status")
          .update({
            status: "enrolled",
            updated_at: new Date(),
          })
          .eq("application_id", applicationId)
          .eq("user_profile_id", userProfileId);
      }

      return { success: true, data: { reconciled: true } };
    } catch (error) {
      log.error("Reconciliation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
