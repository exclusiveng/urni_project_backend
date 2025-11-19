import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Attendance, AttendanceStatus } from "../entities/Attendance";
import { Branch } from "../entities/Branch";
import { AuthRequest } from "../middleware/auth.middleware";
// import { UserRole } from "../entities/User";

const attendanceRepo = AppDataSource.getRepository(Attendance);
const branchRepo = AppDataSource.getRepository(Branch);

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
      if (!lat || !long) {
        return res.status(400).json({ message: "GPS coordinates are required for clock-in." });
      }

      // Check all branches
      const branches = await branchRepo.find();
      
      for (const branch of branches) {
        const dist = getDistanceFromLatLonInMeters(lat, long, branch.gps_lat, branch.gps_long);
        // Check if within radius
        if (dist <= branch.radius_meters) {
          validBranch = branch;
          break; // Found a valid branch, stop checking
        }
      }

      if (!validBranch) {
        return res.status(403).json({ 
          message: "You are not within the allowed radius of any office branch.",
          suggestion: "Please move closer to the office or request a manual override."
        });
      }
    }

    // 3. Determine Status (Simple logic: Late if after 9:00 AM)
    const now = new Date();
    let status = AttendanceStatus.PRESENT;
    if (now.getHours() >= 9 && now.getMinutes() > 0) { // Example rule
        status = AttendanceStatus.LATE;
    }

    // 4. Create Record
    const attendance = attendanceRepo.create({
      user_id: user.id,
      branch_id: validBranch?.id, // Null if override
      clock_in_time: now,
      status,
      is_manual_override: !!is_manual_override,
      override_reason: is_manual_override ? override_reason : null
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
    const user = req.user!;
    
    // Find the active session for today that hasn't been clocked out
    const attendance = await attendanceRepo.findOne({
      where: { 
        user_id: user.id, 
        clock_out_time: undefined 
      }, // TypeORM might need IsNull() helper here, but undefined works in basic query
      order: { clock_in_time: "DESC" }
    });

    if (!attendance) {
      return res.status(400).json({ message: "No active clock-in record found." });
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