import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { IsNull } from "typeorm";
import { Attendance, AttendanceStatus } from "../entities/Attendance";
import { Branch } from "../entities/Branch";
import { User } from "../entities/User"; // Import User entity
import { AuthRequest } from "../middleware/auth.middleware";
// import { UserRole } from "../entities/User";

const attendanceRepo = AppDataSource.getRepository(Attendance);
const branchRepo = AppDataSource.getRepository(Branch);
const userRepo = AppDataSource.getRepository(User); // Initialize User repository

// Helper: Haversine Formula to calculate distance in meters
const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

const deg2rad = (deg: number) => deg * (Math.PI / 180);

export const clockIn = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { lat, long, is_manual_override, override_reason } = req.body;
    const user = req.user!;

    // 1. Check if already clocked in today (prevent double entry)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const existing = await attendanceRepo.createQueryBuilder("attendance")
      .where("attendance.user_id = :userId", { userId: user.id })
      .andWhere("attendance.clock_in_time >= :todayStart", { todayStart })
      .getOne();

    if (existing) {
      return res.status(400).json({ message: "You have already clocked in today." });
    }

    let validBranch: Branch | null = null;

    // 2. If NOT Manual Override, validate GPS
    if (!is_manual_override) {
      // For a standard clock-in, GPS coordinates from the user are mandatory.
      if (!lat || !long) {
        return res.status(400).json({ message: "GPS coordinates (lat, long) are required for clock-in." });
      }

      // Fetch the user's assigned branch with its details
      const userWithBranch = await userRepo.findOne({
        where: { id: user.id },
        relations: ["branch"], // Eager load the branch relation
      });

      if (!userWithBranch || !userWithBranch.branch) {
        // If user is not assigned to a branch, or branch details are missing
        return res.status(403).json({
          message: "You are not assigned to an office branch. Please contact an administrator or use manual override.",
        });
      }

      const assignedBranch = userWithBranch.branch;

      // Calculate the distance between the user's location and their assigned branch.
      const dist = getDistanceFromLatLonInMeters(lat, long, assignedBranch.gps_lat, assignedBranch.gps_long);

      // Check if the user is within the allowed radius of their branch.
      if (dist <= assignedBranch.radius_meters) {
        validBranch = assignedBranch; // The location is valid.
      } else {
        return res.status(403).json({ 
          message: `You are not within the allowed radius of your assigned branch (${assignedBranch.name}).`,
          suggestion: "Please move closer to your assigned office or request a manual override."
        });
      }
    }

    // 3. Determine Status (Simple logic: Late if after 9:00 AM)
    const now = new Date();
    let status = AttendanceStatus.PRESENT;
    // Example rule: If current time is 9:01 AM or later, mark as LATE
    if (now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0)) {
        status = AttendanceStatus.LATE;
    }

    // 4. Create Record
    const attendance = attendanceRepo.create({
      user_id: user.id,
      branch_id: validBranch?.id, // Will be undefined if is_manual_override is true and validBranch is null
      clock_in_time: now,
      status,
      is_manual_override: !!is_manual_override,
      override_reason: is_manual_override ? override_reason : undefined // Use undefined for nullable columns if not provided
    });

    await attendanceRepo.save(attendance);

    res.status(201).json({
      status: "success",
      message: is_manual_override 
        ? "Manual clock-in request submitted." 
        : `Clocked in successfully at ${validBranch?.name}`,
      data: { attendance }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const clockOut = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { lat, long } = req.body;
    const user = req.user!;
    const now = new Date();

    // 1. Time Validation: Check if it's 5 PM or later
    if (now.getHours() < 17) { // 17 is 5 PM in 24-hour format
      return res.status(403).json({ message: "Clock-out is only allowed after 5:00 PM." });
    }
    
    // 2. Location Validation: Check if user is within their branch radius
    if (!lat || !long) {
      return res.status(400).json({ message: "GPS coordinates (lat, long) are required for clock-out." });
    }

    const userWithBranch = await userRepo.findOne({
      where: { id: user.id },
      relations: ["branch"],
    });

    if (!userWithBranch || !userWithBranch.branch) {
      return res.status(403).json({
        message: "You are not assigned to an office branch. Please contact an administrator.",
      });
    }

    const assignedBranch = userWithBranch.branch;
    const dist = getDistanceFromLatLonInMeters(lat, long, assignedBranch.gps_lat, assignedBranch.gps_long);

    if (dist > assignedBranch.radius_meters) {
      return res.status(403).json({ 
        message: `You are not within the allowed radius of your assigned branch (${assignedBranch.name}) to clock out.`,
        suggestion: "Please move closer to your assigned office branch."
      });
    }

    // 3. Find the active session for today that hasn't been clocked out
    const attendance = await attendanceRepo.findOne({
      where: { 
        user_id: user.id, 
        clock_out_time: IsNull()
      }, 
      order: { clock_in_time: "DESC" }
    });

    if (!attendance) {
      return res.status(400).json({ message: "No active clock-in record found to clock out." });
    }

    attendance.clock_out_time = new Date();
    await attendanceRepo.save(attendance);

    res.status(200).json({
      status: "success",
      message: "Clocked out successfully.",
      data: {
        start: attendance.clock_in_time,
        end: attendance.clock_out_time
      }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Create a Branch
export const createBranch = async (req: Request, res: Response) => {
  try {
    const branch = branchRepo.create(req.body);
    await branchRepo.save(branch);
    res.status(201).json({ status: "success", data: branch });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};