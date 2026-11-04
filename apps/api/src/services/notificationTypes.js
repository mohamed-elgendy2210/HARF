export const NOTIFICATION_TYPES = Object.freeze({
  ACCOUNT_APPROVAL: 'account_approval',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  ACCOUNT_PENDING_REVIEW: 'account_pending_review',
  EMAIL_VERIFIED: 'email_verified',
  PAYMENT_REVIEW: 'payment_review',
  SUBSCRIPTION_STATUS: 'subscription_status',
  APPOINTMENT_REQUEST: 'appointment_request',
  APPOINTMENT_DECISION: 'appointment_decision',
  SESSION_REMINDER: 'session_reminder',
  SESSION_REPORT: 'session_report',
  LEARNING_PATH_ASSIGNED: 'learning_path_assigned',
  TESTIMONIAL_SUBMITTED: 'testimonial_submitted',
  TESTIMONIAL_DECISION: 'testimonial_decision',
  SYSTEM: 'system_notification'
});

export const ALL_NOTIFICATION_TYPES = Object.freeze(Object.values(NOTIFICATION_TYPES));
