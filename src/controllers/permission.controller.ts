import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { User } from "../entities/User";
import { Permission, getDefaultPermissions } from "../entities/Permission";
import { AuthRequest } from "../middleware/auth.middleware";

const userRepo = AppDataSource.getRepository(User);

// 1. Add a specific permission to a user
export const addPermissionToUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { permission } = req.body;

    if (!Object.values(Permission).includes(permission)) {
      return res.status(400).json({ message: "Invalid permission string" });
    }

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize if null (though default is [])
    if (!user.permissions) user.permissions = [];

    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
      await userRepo.save(user);
    }

    return res.status(200).json({
      status: "success",
      message: `Permission '${permission}' added to user`,
      data: {
        permissions: user.permissions,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error adding permission", error: error.message });
  }
};

// 2. Remove a permission from a user
export const removePermissionFromUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { permission } = req.body;

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.permissions) user.permissions = [];

    // Filter out the permission
    user.permissions = user.permissions.filter((p) => p !== permission);
    await userRepo.save(user);

    return res.status(200).json({
      status: "success",
      message: `Permission '${permission}' removed from user`,
      data: {
        permissions: user.permissions,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error removing permission", error: error.message });
  }
};

// 3. Get a user's effective permissions (Role defaults + Custom)
export const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const defaultPerms = getDefaultPermissions(user.role);
    const customPerms = user.permissions || [];
    
    // Merge unique
    const uniquePerms = Array.from(new Set([...defaultPerms, ...customPerms]));

    return res.status(200).json({
      status: "success",
      data: {
        userId: user.id,
        role: user.role,
        permissions: uniquePerms,
        custom_permissions: customPerms, // explicitly show what's custom
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error feching permissions", error: error.message });
  }
};

// 4. List all available system permissions
export const listAllSystemPermissions = async (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "success",
    data: Object.values(Permission),
  });
};
