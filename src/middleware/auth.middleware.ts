import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../../database/data-source";
import { User, UserRole } from "../entities/User";

// Extend Express Request to include our User
export interface AuthRequest extends Request {
  user?: User;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> => {
  let token;

  // 1. Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized to access this route" });
  }

  try {
    // 2. Verify token
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    // 3. Check if user still exists
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({ message: "The user belonging to this token no longer exists." });
    }

    // 4. Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ message: "User account has been deactivated." });
    }

    // Grant Access
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Role Authorization (RBAC) — broad role gate
export const restrictTo = (...roles: UserRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    return next();
  };
};