import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { User, UserRole, UserPosition } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { Department } from "../entities/Department";
import { Branch } from "../entities/Branch";
import { Company } from "../entities/Company";
import { DeepPartial } from "typeorm";
import { NotificationService } from "../services/notification.service";
import { mailService } from "../services/mail.service";
import { NotificationType } from "../entities/Notification";
import { appCache, CacheKeys } from "../utils/cache";
import { Permission, userHasPermission } from "../entities/Permission";

// Extend Express Request
declare module "express" {
  export interface Request {
    file?: Express.Multer.File;
  }
}

const userRepo = AppDataSource.getRepository(User);
const DeptRepo = AppDataSource.getRepository(Department);
const BranchRepo = AppDataSource.getRepository(Branch);
const CompanyRepo = AppDataSource.getRepository(Company);

const signToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET!, {
    expiresIn: "30d",
  });
};

// REGISTER: Only GENERAL_STAFF (default) or creation of the first CEO
export const register = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { name, email, password, position } = req.body;
    let department_id = req.body.department_id || undefined;
    let reports_to_id = req.body.reports_to_id || undefined;
    let company_id = req.body.company_id || undefined;
    const branch_id = req.body.branch_id || undefined;
    const phone = req.body.phone || undefined;
    const address = req.body.address || undefined;
    const dob = req.body.dob ? new Date(req.body.dob) : undefined;

    // 1. Check if user exists
    const existingUser = await userRepo.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. Check if first user (CEO)
    const userCount = await userRepo.count();
    const isFirstUser = userCount === 0;

    let assignedRole = UserRole.GENERAL_STAFF;
    let companyAbbreviation: string | undefined = undefined;

    if (isFirstUser) {
      assignedRole = UserRole.CEO;
      department_id = undefined;
      company_id = undefined;
      reports_to_id = undefined;
    } else {
      // Normal registration validation
      if (!company_id) {
        return res.status(400).json({ message: "Company ID is required." });
      }
      if (!department_id) {
        return res.status(400).json({ message: "Department ID is required." });
      }

      const company = await CompanyRepo.findOne({ where: { id: company_id } });
      if (!company) {
        return res.status(400).json({ message: "Company not found." });
      }
      companyAbbreviation = company.abbreviation;

      const department = await DeptRepo.findOne({
        where: { id: department_id },
      });
      if (!department || department.company_id !== company_id) {
        return res
          .status(400)
          .json({ message: "Invalid department for this company." });
      }
    }

    if (branch_id) {
      const branch = await BranchRepo.findOne({ where: { id: branch_id } });
      if (!branch)
        return res.status(400).json({ message: "Branch not found." });
    }

    let profile_pic_url: string | undefined = undefined;
    if (req.file) {
      const imagePath = req.file.path.replace(/\\/g, "/");
      profile_pic_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Validate position provided or default to FULLTIME
    const userPosition = Object.values(UserPosition).includes(position)
      ? position
      : UserPosition.FULLTIME;

    const newUserPayload: DeepPartial<User> = {
      name,
      email,
      password: hashedPassword,
      role: assignedRole,
      position: userPosition, // stores staff type (Corper, Intern, etc.)
      company_id,
      department_id,
      reports_to_id,
      branch_id,
      phone,
      address,
      dob,
      profile_pic_url,
    };

    const newUser = userRepo.create(newUserPayload);
    if (companyAbbreviation)
      newUser.setCompanyAbbreviation(companyAbbreviation);

    await userRepo.save(newUser);

    // Welcome Notification & Email
    await NotificationService.createNotification({
      userId: newUser.id,
      title: "Welcome to TBG!",
      body: `Hi ${newUser.name}, welcome aboard! We're glad to have you in the ${companyAbbreviation || "TBG"} team.`,
      type: NotificationType.GENERIC,
      emailOptions: {
        send: true,
        subject: "Welcome to TBG!",
        context: {
          name: newUser.name,
          body: "Your account has been successfully created. You can now log in and start using the platform.",
        },
      },
    });

    const token = signToken(newUser.id);
    newUser.password = undefined as any;

    return res.status(201).json({
      status: "success",
      token,
      data: { user: newUser },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
export const login = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Please provide email and password" });

    const user = await userRepo
      .createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.email = :email", { email })
      .getOne();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated." });
    }

    const token = signToken(user.id);
    user.password = undefined as any;

    return res.status(200).json({
      status: "success",
      token,
      data: { user },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE USER (Self or Admin with USER_UPDATE permission)
export const updateUser = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    // SECURITY: Only the user themselves OR a user with USER_UPDATE permission may update a profile.
    const isSelf = currentUser.id === id;
    const canUpdate = userHasPermission(
      currentUser.role,
      currentUser.permissions || [],
      Permission.USER_UPDATE,
    );
    if (!isSelf && !canUpdate) {
      return res
        .status(403)
        .json({ message: "You do not have permission to update this user." });
    }

    const { name, email, department_id, company_id, phone, position } =
      req.body;
    // NOTE: `role` is intentionally excluded — use the dedicated /promote endpoint.

    const user = await userRepo.findOne({ where: { id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = name || user.name;
    user.email = email || user.email;
    user.position = position || user.position;

    // Handle company/department updates logic...
    if (company_id !== undefined) {
      // ... same logic as before, essentially
      if (!company_id) {
        user.company_id = null as any;
      } else {
        const exists = await CompanyRepo.findOne({ where: { id: company_id } });
        if (!exists)
          return res.status(400).json({ message: "Company not found" });
        user.company_id = company_id;
      }
    }

    if (department_id !== undefined) {
      if (!department_id) {
        user.department_id = null as any;
      } else {
        const dept = await DeptRepo.findOne({ where: { id: department_id } });
        if (!dept)
          return res.status(400).json({ message: "Department not found" });
        // Check alignment
        const effectiveCompanyId =
          company_id !== undefined ? company_id : user.company_id;
        if (effectiveCompanyId && dept.company_id !== effectiveCompanyId) {
          return res
            .status(400)
            .json({ message: "Department mismatch with company" });
        }
        user.department_id = department_id;
      }
    }

    user.phone = phone || user.phone;
    await userRepo.save(user);

    // Invalidate Cache
    appCache.del(CacheKeys.USER_ME(id));

    return res
      .status(200)
      .json({ message: "User updated successfully", data: { user } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// PROMOTE USER (CEO/MD/HR can promote users)
export const promoteUser = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { userId } = req.params;
    const { role, department_id } = req.body;

    // Only allow specific roles for promotion here
    const allowedRoles = [
      UserRole.DEPARTMENT_HEAD,
      UserRole.ASST_DEPARTMENT_HEAD,
      UserRole.HR,
      UserRole.ADMIN,
      UserRole.MD,
    ];

    if (!allowedRoles.includes(role)) {
      return res
        .status(400)
        .json({ message: "Invalid role for promotion flow." });
    }

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // CEO Lock: Do not allow changing the CEO's role
    if (user.role === UserRole.CEO) {
      return res
        .status(400)
        .json({ message: "The CEO role cannot be changed or demoted." });
    }

    // Validate dep if becoming a head
    if (
      [UserRole.DEPARTMENT_HEAD, UserRole.ASST_DEPARTMENT_HEAD].includes(role)
    ) {
      if (!department_id && !user.department_id) {
        return res
          .status(400)
          .json({ message: "Department must be assigned for this role." });
      }
      if (department_id) {
        const dept = await DeptRepo.findOne({ where: { id: department_id } });
        if (!dept)
          return res.status(400).json({ message: "Department not found." });
        user.department_id = department_id;
      }
    }

    user.role = role;
    await userRepo.save(user);

    // Invalidate Cache
    appCache.del(CacheKeys.USER_ME(userId));

    // Notify User of Promotion/Role Change
    await NotificationService.createNotification({
      userId: user.id,
      title: "Role Updated",
      body: `Your role has been updated to ${role}.`,
      type: NotificationType.GENERIC,
      emailOptions: {
        send: true,
        subject: "Your Account Role has been Updated",
        context: {
          name: user.name,
          body: `We are pleased to inform you that your role has been successfully updated to ${role} in the system.`,
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: `User promoted to ${role}`,
      data: { user },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  // SECURITY: Always return the same generic response regardless of whether the
  // email exists, to prevent account enumeration.
  const GENERIC_RESPONSE = {
    status: "success",
    message:
      "If an account with that email exists, a password reset link has been sent.",
  };

  try {
    const { email } = req.body;
    const user = await userRepo.findOne({ where: { email } });

    if (!user) {
      // Still return 200 to prevent enumeration
      return res.status(200).json(GENERIC_RESPONSE);
    }

    // Generate a secure random token using Node built-in crypto (no extra deps)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the raw token + expiry on the user record
    (user as any).reset_password_token = rawToken;
    user.reset_password_expires = expiresAt;
    await userRepo.save(user);

    // Build a backend-hosted reset link — no FRONTEND_URL dependency
    const host =
      process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetLink = `${host}/api/auth/reset-password?token=${rawToken}`;

    // Send email with reset link
    await mailService.sendMail({
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Use this link to reset your password (valid for 10 minutes): ${resetLink}`,
      html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to reset your password</a> (link valid for 10 minutes).</p><p>If you did not request this, please ignore this email.</p>`,
    });

    return res.status(200).json(GENERIC_RESPONSE);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Helper: compile and render an HBS template from the templates directory
const renderTemplate = (templateName: string, context: any): string => {
  const filePath = path.join(
    process.cwd(),
    "src",
    "templates",
    `${templateName}.hbs`,
  );
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = Handlebars.compile(source);
  return compiled(context);
};

// GET /api/auth/reset-password?token=xxx  — serves the password reset form
export const showResetForm = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const token = req.query.token as string;

    if (!token) {
      const html = renderTemplate("reset-password-result", {
        title: "Invalid Link",
        success: false,
        error: "No reset token provided. Please use the link from your email.",
      });
      return res.status(400).send(html);
    }

    // Validate the token exists and hasn't expired (don't just serve form blindly)
    const user = await userRepo
      .createQueryBuilder("user")
      .addSelect("user.reset_password_token")
      .addSelect("user.reset_password_expires")
      .where("user.reset_password_token = :token", { token })
      .getOne();

    if (
      !user ||
      !user.reset_password_expires ||
      user.reset_password_expires < new Date()
    ) {
      const html = renderTemplate("reset-password-result", {
        title: "Link Expired",
        success: false,
        error:
          "This password reset link is invalid or has expired. Please request a new one.",
      });
      return res.status(400).send(html);
    }

    // Token is valid — serve the form with the token embedded
    const html = renderTemplate("reset-password-form", { token });
    return res.status(200).send(html);
  } catch (error: any) {
    const html = renderTemplate("reset-password-result", {
      title: "Error",
      success: false,
      error: "Something went wrong. Please try again.",
    });
    return res.status(500).send(html);
  }
};

// POST /api/auth/reset-password  — processes the form and renders result page
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      const html = renderTemplate("reset-password-form", {
        token: token || "",
        error: "Please fill in all fields.",
      });
      return res.status(400).send(html);
    }

    if (newPassword.length < 8) {
      const html = renderTemplate("reset-password-form", {
        token,
        error: "Password must be at least 8 characters.",
      });
      return res.status(400).send(html);
    }

    // Find user by raw token, also selecting the hidden reset fields
    const user = await userRepo
      .createQueryBuilder("user")
      .addSelect("user.reset_password_token")
      .addSelect("user.reset_password_expires")
      .addSelect("user.password")
      .where("user.reset_password_token = :token", { token })
      .getOne();

    if (!user) {
      const html = renderTemplate("reset-password-result", {
        title: "Reset Failed",
        success: false,
        error: "Invalid or expired password reset token.",
      });
      return res.status(400).send(html);
    }

    // Check token expiry
    if (
      !user.reset_password_expires ||
      user.reset_password_expires < new Date()
    ) {
      const html = renderTemplate("reset-password-result", {
        title: "Token Expired",
        success: false,
        error:
          "This password reset link has expired. Please request a new one.",
      });
      return res.status(400).send(html);
    }

    // Hash the new password and save
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear the reset fields
    (user as any).reset_password_token = null;
    user.reset_password_expires = null as any;

    await userRepo.save(user);

    // Invalidate Cache
    appCache.del(CacheKeys.USER_ME(user.id));

    const html = renderTemplate("reset-password-result", {
      title: "Password Reset",
      success: true,
    });
    return res.status(200).send(html);
  } catch (error: any) {
    const html = renderTemplate("reset-password-result", {
      title: "Error",
      success: false,
      error: "Something went wrong. Please try again.",
    });
    return res.status(500).send(html);
  }
};

export const uploadUserSignature = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const user = req.user!;
    const imagePath = req.file.path.replace(/\\/g, "/");
    const signatureUrl = `${req.protocol}://${req.get("host")}/${imagePath}`;

    user.signature_url = signatureUrl;
    await userRepo.save(user);

    // Invalidate Cache
    appCache.del(CacheKeys.USER_ME(user.id));

    return res
      .status(200)
      .json({ status: "success", data: { signature_url: signatureUrl } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    // Allow self-delete or Admin/CEO (normalized check)
    const isAdmin =
      currentUser.role?.toString().trim().toUpperCase() === "CEO" ||
      currentUser.role === UserRole.ADMIN;
    const isOwner = currentUser.id === id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const user = await userRepo.findOne({ where: { id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // CEO Lock: Do not allow deleting the CEO
    if (user.role === UserRole.CEO) {
      return res
        .status(400)
        .json({ message: "The CEO account cannot be deleted." });
    }

    await userRepo.remove(user);

    // Invalidate Cache
    appCache.del(CacheKeys.USER_ME(id));

    return res.status(200).json({ message: "User deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
