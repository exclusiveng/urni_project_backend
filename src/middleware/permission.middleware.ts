import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { Permission, userHasPermission } from "../entities/Permission";
// import { UserRole } from "../entities/User";

/**
 * Middleware: Require that the authenticated user has **at least one** of the
 * listed permissions.  CEO always passes (god-mode bypass inside `userHasPermission`).
 *
 * Usage:
 *   router.post("/", requirePermission(Permission.COMPANY_CREATE), handler);
 *   router.patch("/:id", requirePermission(Permission.COMPANY_UPDATE, Permission.COMPANY_CREATE), handler);
 */
export const requirePermission = (...requiredPermissions: Permission[]) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Response | void => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Not authorized to access this route" });
    }

    const { role, permissions: customPermissions } = req.user;

    // Check if user has ANY of the required permissions
    const hasAccess = requiredPermissions.some((perm) =>
      userHasPermission(role, customPermissions || [], perm),
    );

    if (!hasAccess) {
      return res.status(403).json({
        message:
          "You do not have the required permission to perform this action",
      });
    }

    return next();
  };
};
