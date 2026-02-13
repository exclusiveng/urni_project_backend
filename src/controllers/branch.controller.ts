import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Branch } from "../entities/Branch";

const branchRepo = AppDataSource.getRepository(Branch);

export const createBranch = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { name, location_city, address, gps_lat, gps_long, radius_meters } =
      req.body;
    const branch = branchRepo.create({
      name,
      location_city,
      address,
      gps_lat,
      gps_long,
      radius_meters,
    });
    await branchRepo.save(branch);
    return res.status(201).json({ status: "success", data: { branch } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAllBranches = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [branches, total] = await branchRepo.findAndCount({
      relations: ["companies"],
      take: limit,
      skip: skip,
      order: { id: "ASC" },
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: "success",
      data: {
        branches,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getBranchById = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const branch = await branchRepo.findOne({
      where: { id },
      relations: ["companies"],
    });
    if (!branch) return res.status(404).json({ message: "Branch not found" });
    return res.status(200).json({ status: "success", data: { branch } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBranch = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    await branchRepo.update(id, req.body);
    return res.status(200).json({ message: "Branch updated" });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteBranch = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    await branchRepo.delete(id);
    return res.status(200).json({ message: "Branch deleted" });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};
