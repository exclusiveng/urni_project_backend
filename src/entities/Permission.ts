import { UserRole } from "./User";

/**
 * All granular permission strings in the system.
 * These can be added/removed per-user to customise access beyond their role defaults.
 */
export enum Permission {
  // Company management
  COMPANY_CREATE = "company:create",
  COMPANY_UPDATE = "company:update",
  COMPANY_DELETE = "company:delete",
  COMPANY_VIEW_ALL = "company:view_all",

  // Branch management
  BRANCH_CREATE = "branch:create",
  BRANCH_UPDATE = "branch:update",
  BRANCH_DELETE = "branch:delete",

  // Department management
  DEPT_CREATE = "department:create",
  DEPT_UPDATE = "department:update",
  DEPT_DELETE = "department:delete",
  DEPT_SET_HEAD = "department:set_head",
  DEPT_ADD_MEMBER = "department:add_member",
  DEPT_REMOVE_MEMBER = "department:remove_member",

  // User management
  USER_CREATE = "user:create",
  USER_UPDATE = "user:update",
  USER_DELETE = "user:delete",
  USER_VIEW_ALL = "user:view_all",
  USER_PROMOTE = "user:promote",
  USER_MANAGE_PERMISSIONS = "user:manage_permissions",

  // Attendance
  ATTENDANCE_VIEW_ALL = "attendance:view_all",
  ATTENDANCE_METRICS = "attendance:metrics",
  ATTENDANCE_OVERRIDE = "attendance:override",

  // Leave
  LEAVE_APPROVE = "leave:approve",
  LEAVE_VIEW_ALL = "leave:view_all",

  // Tickets
  TICKET_MANAGE = "ticket:manage",
  TICKET_DELETE = "ticket:delete",

  // Appraisals
  APPRAISAL_CREATE = "appraisal:create",
  APPRAISAL_VIEW_ALL = "appraisal:view_all",

  // Notifications
  NOTIFICATION_BROADCAST = "notification:broadcast",
}

/**
 * Returns the set of permissions a role has by default (always granted).
 * CEO gets everything. Other roles get progressively fewer.
 */
export function getDefaultPermissions(role: UserRole): Permission[] {
  const allPermissions = Object.values(Permission);

  switch (role) {
    case UserRole.CEO:
      return allPermissions; // God mode

    case UserRole.MD:
      return [
        Permission.COMPANY_CREATE,
        Permission.COMPANY_UPDATE,
        Permission.COMPANY_VIEW_ALL,
        Permission.BRANCH_UPDATE,
        Permission.DEPT_CREATE,
        Permission.DEPT_UPDATE,
        Permission.DEPT_SET_HEAD,
        Permission.DEPT_ADD_MEMBER,
        Permission.DEPT_REMOVE_MEMBER,
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_PROMOTE,
        Permission.ATTENDANCE_VIEW_ALL,
        Permission.ATTENDANCE_METRICS,
        Permission.ATTENDANCE_OVERRIDE,
        Permission.LEAVE_APPROVE,
        Permission.LEAVE_VIEW_ALL,
        Permission.TICKET_MANAGE,
        Permission.APPRAISAL_VIEW_ALL,
        Permission.NOTIFICATION_BROADCAST,
      ];

    case UserRole.ADMIN:
      return [
        Permission.COMPANY_CREATE,
        Permission.COMPANY_UPDATE,
        Permission.COMPANY_VIEW_ALL,
        Permission.BRANCH_CREATE,
        Permission.BRANCH_UPDATE,
        Permission.BRANCH_DELETE,
        Permission.DEPT_CREATE,
        Permission.DEPT_UPDATE,
        Permission.DEPT_DELETE,
        Permission.DEPT_SET_HEAD,
        Permission.DEPT_ADD_MEMBER,
        Permission.DEPT_REMOVE_MEMBER,
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_DELETE,
        Permission.USER_PROMOTE,
        Permission.USER_MANAGE_PERMISSIONS,
        Permission.ATTENDANCE_VIEW_ALL,
        Permission.ATTENDANCE_METRICS,
        Permission.ATTENDANCE_OVERRIDE,
        Permission.LEAVE_APPROVE,
        Permission.LEAVE_VIEW_ALL,
        Permission.TICKET_MANAGE,
        Permission.TICKET_DELETE,
        Permission.APPRAISAL_CREATE,
        Permission.APPRAISAL_VIEW_ALL,
        Permission.NOTIFICATION_BROADCAST,
      ];

    case UserRole.HR:
      return [
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_PROMOTE,
        Permission.DEPT_ADD_MEMBER,
        Permission.DEPT_REMOVE_MEMBER,
        Permission.LEAVE_APPROVE,
        Permission.LEAVE_VIEW_ALL,
        Permission.ATTENDANCE_VIEW_ALL,
        Permission.ATTENDANCE_METRICS,
        Permission.APPRAISAL_CREATE,
        Permission.APPRAISAL_VIEW_ALL,
      ];

    case UserRole.DEPARTMENT_HEAD:
      return [
        Permission.DEPT_ADD_MEMBER,
        Permission.DEPT_REMOVE_MEMBER,
        Permission.LEAVE_APPROVE,
        Permission.ATTENDANCE_VIEW_ALL,
        Permission.ATTENDANCE_METRICS,
        Permission.TICKET_MANAGE,
        Permission.APPRAISAL_CREATE,
      ];

    case UserRole.ASST_DEPARTMENT_HEAD:
      return [
        Permission.LEAVE_APPROVE,
        Permission.ATTENDANCE_VIEW_ALL,
        Permission.TICKET_MANAGE,
        Permission.APPRAISAL_CREATE,
      ];

    case UserRole.GENERAL_STAFF:
    default:
      return []; // No extra permissions by default
  }
}

/**
 * Check if a user (by role + custom permissions) has a specific permission.
 */
export function userHasPermission(
  role: UserRole,
  customPermissions: string[],
  required: Permission,
): boolean {
  // CEO always passes
  if (role === UserRole.CEO) return true;

  const defaults = getDefaultPermissions(role);
  return defaults.includes(required) || customPermissions.includes(required);
}
