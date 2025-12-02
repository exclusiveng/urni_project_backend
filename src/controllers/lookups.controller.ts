import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { Branch } from "../entities/Branch";
import { User, UserRole } from "../entities/User";
import { TicketSeverity, TicketStatus } from "../entities/Ticket";
import { AttendanceStatus } from "../entities/Attendance";

/**
 * Helper to parse pagination & search params
 */
const parsePaging = (req: Request) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 10);
  const skip = (page - 1) * limit;
  const q = (req.query.q as string) || "";
  return { page, limit, skip, q };
};

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip, q } = parsePaging(req);
    const repo = AppDataSource.getRepository(Department);

    const qb = repo.createQueryBuilder("d").select(["d.id", "d.name"]);
    if (q) qb.where("LOWER(d.name) LIKE :q", { q: `%${q.toLowerCase()}%` });
    qb.orderBy("d.name", "ASC").skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return res.status(200).json({
      status: "success",
      results: rows.length,
      page,
      limit,
      total,
      data: rows,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getBranches = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip, q } = parsePaging(req);
    const repo = AppDataSource.getRepository(Branch);

    const qb = repo.createQueryBuilder("b").select(["b.id", "b.name"]);
    if (q) qb.where("LOWER(b.name) LIKE :q", { q: `%${q.toLowerCase()}%` });
    qb.orderBy("b.name", "ASC").skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return res.status(200).json({
      status: "success",
      results: rows.length,
      page,
      limit,
      total,
      data: rows,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip, q } = parsePaging(req);
    const repo = AppDataSource.getRepository(User);

    const qb = repo
      .createQueryBuilder("u")
      .select(["u.id", "u.name", "u.email"]);

    if (q) {
      qb.where("LOWER(u.name) LIKE :q OR LOWER(u.email) LIKE :q", { q: `%${q.toLowerCase()}%` });
    }

    qb.orderBy("u.name", "ASC").skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return res.status(200).json({
      status: "success",
      results: rows.length,
      page,
      limit,
      total,
      data: rows,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(User);

    const user = await repo.findOne({
      where: { id },
      relations: ["department", "branch", "reportsTo"],
    });

    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    // It's crucial to never send the password hash to the client
    user.password = undefined as any;

    return res.status(200).json({ status: "success", data: user });

  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

/**
 * Return enum lookups as { id, name } pairs.
 * Works for UserRole, TicketSeverity, TicketStatus, AttendanceStatus
 */
const enumToPairs = (enm: any) =>
  Object.values(enm)
    .filter((v) => typeof v === "string")
    .map((v) => ({ id: v, name: v }));

export const getRoles = async (_req: Request, res: Response) => {
  try {
    const data = enumToPairs(UserRole);
    return res.status(200).json({ status: "success", results: data.length, data });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getTicketSeverities = async (_req: Request, res: Response) => {
  try {
    const data = enumToPairs(TicketSeverity);
    return res.status(200).json({ status: "success", results: data.length, data });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getTicketStatuses = async (_req: Request, res: Response) => {
  try {
    const data = enumToPairs(TicketStatus);
    return res.status(200).json({ status: "success", results: data.length, data });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

export const getAttendanceStatuses = async (_req: Request, res: Response) => {
  try {
    const data = enumToPairs(AttendanceStatus);
    return res.status(200).json({ status: "success", results: data.length, data });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};