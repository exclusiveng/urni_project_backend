import { Request, Response } from "express";
import { Between, IsNull, MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../../database/data-source";
import { Attendance, AttendanceStatus } from "../entities/Attendance";
import { Branch } from "../entities/Branch";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";
import { appCache, CacheKeys } from "../utils/cache";
import { isWeekend, getWeekendFilterWhereClause } from "../utils/weekendUtils";

const attendanceRepo = AppDataSource.getRepository(Attendance);
const branchRepo = AppDataSource.getRepository(Branch);
const userRepo = AppDataSource.getRepository(User);

// Helper: Haversine Formula to calculate distance in meters
const getDistanceFromLatLonInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

const deg2rad = (deg: number) => deg * (Math.PI / 180);

// Helper: Calculate hours between two dates
const calculateHours = (startTime: Date, endTime: Date): number => {
  const diffMs = endTime.getTime() - startTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
};

// Check current attendance status (clocked in or not)
export const getAttendanceStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const user = req.user!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Find the latest record for today
    const attendance = await attendanceRepo.findOne({
      where: {
        user_id: user.id,
        clock_in_time: MoreThanOrEqual(todayStart),
      },
      order: { clock_in_time: "DESC" },
    });

    if (!attendance) {
      return res.status(200).json({
        status: "success",
        data: { isClockedIn: false },
      });
    }

    // If there is no clock_out_time, they are currently clocked in
    const isClockedIn = !attendance.clock_out_time;

    return res.status(200).json({
      status: "success",
      data: {
        isClockedIn,
        clockInTime: attendance.clock_in_time,
        clockOutTime: attendance.clock_out_time,
        attendanceId: attendance.id,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const clockIn = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { lat, long, is_manual_override, override_reason, is_weekend_work } =
      req.body;
    const user = req.user!;

    // 0. CEO Exemption
    if (user.role === UserRole.CEO) {
      return res.status(403).json({
        message: "As CEO, you are exempted from clocking in.",
        info: "Your attendance is automatically marked as present.",
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Weekend detection and auto-flagging
    const now = new Date();
    const isWeekendDay = isWeekend(now);
    const finalWeekendFlag = isWeekendDay ? true : is_weekend_work || false;

    // 1. Run core validation queries concurrently
    const [existing, branchResult] = await Promise.all([
      attendanceRepo
        .createQueryBuilder("attendance")
        .where("attendance.user_id = :userId", { userId: user.id })
        .andWhere("attendance.clock_in_time >= :todayStart", { todayStart })
        .select("attendance.id")
        .getOne(),
      (async () => {
        if (is_manual_override) return { validBranch: null, allBranches: [] };

        if (!lat || !long)
          throw new Error(
            "GPS coordinates (lat, long) are required for clock-in.",
          );

        // Try Cache First
        let allBranches = appCache.get<Branch[]>(CacheKeys.ALL_BRANCHES);
        if (!allBranches) {
          allBranches = await branchRepo.find();
          if (allBranches && allBranches.length > 0) {
            appCache.set(CacheKeys.ALL_BRANCHES, allBranches);
          }
        }

        if (!allBranches || allBranches.length === 0)
          return { validBranch: null, allBranches: [] };

        // Optimized proximity check
        const validBranch = allBranches.find(
          (branch) =>
            getDistanceFromLatLonInMeters(
              lat,
              long,
              branch.gps_lat,
              branch.gps_long,
            ) <= branch.radius_meters,
        );

        return { validBranch: validBranch || null, allBranches };
      })().catch((err) => ({ error: err.message })),
    ]);

    // Handle results
    if (existing) {
      return res
        .status(400)
        .json({ message: "You have already clocked in today." });
    }

    let finalBranch: Branch | null = null;

    if (!is_manual_override) {
      if (branchResult && "error" in branchResult) {
        return res.status(400).json({ message: branchResult.error });
      }

      const { validBranch, allBranches } = branchResult as {
        validBranch: Branch | null;
        allBranches: Branch[];
      };

      if (!allBranches || allBranches.length === 0) {
        return res.status(403).json({
          message:
            "No branches are available in the system. Please contact an administrator or use manual override.",
        });
      }

      if (!validBranch) {
        return res.status(403).json({
          message: `You are not within the allowed radius of any office branch.`,
          suggestion:
            "Please move closer to an office branch or request a manual override.",
          availableBranches: allBranches.map((b) => ({
            name: b.name,
            address: b.address,
            city: b.location_city,
          })),
        });
      }
      finalBranch = validBranch;
    }

    // 2. Determine Status (Simple logic: Late if after 9:00 AM)
    let status = AttendanceStatus.PRESENT;
    const utcHour = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    if (utcHour > 8 || (utcHour === 8 && utcMinutes > 0)) {
      status = AttendanceStatus.LATE;
    }

    // 3. Create Record
    const attendance = attendanceRepo.create({
      user_id: user.id,
      branch_id: finalBranch?.id,
      clock_in_time: now,
      status,
      is_manual_override: !!is_manual_override,
      override_reason: is_manual_override ? override_reason : undefined,
      is_weekend_work: finalWeekendFlag,
    });

    await attendanceRepo.save(attendance);

    // Notify approver(s) when manual override is requested
    if (is_manual_override) {
      if (user.reports_to_id) {
        req.notify?.(user.reports_to_id, {
          type: "ATTENDANCE",
          title: "Manual clock-in request",
          body: `${user.name} requested a manual clock-in.`,
          payload: { attendanceId: attendance.id },
        });
      } else {
        const admins = await userRepo.find({
          where: [{ role: UserRole.CEO }, { role: UserRole.MD }],
        });
        for (const a of admins) {
          req.notify?.(a.id, {
            type: "ATTENDANCE",
            title: "Manual clock-in request",
            body: `${user.name} requested a manual clock-in (no manager assigned).`,
            payload: { attendanceId: attendance.id },
          });
        }
      }
    }

    return res.status(201).json({
      status: "success",
      message: is_manual_override
        ? "Manual clock-in request submitted."
        : finalWeekendFlag
          ? `Weekend work logged successfully at ${finalBranch?.name}`
          : `Clocked in successfully at ${finalBranch?.name}`,
      data: {
        attendance,
        branch: finalBranch
          ? {
              id: finalBranch.id,
              name: finalBranch.name,
              address: finalBranch.address,
            }
          : null,
        isWeekendWork: finalWeekendFlag,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const clockOut = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { lat, long } = req.body;
    const user = req.user!;
    const now = new Date();

    // 0. CEO Exemption
    if (user.role === UserRole.CEO) {
      return res.status(403).json({
        message: "As CEO, you are exempted from clocking out.",
        info: "Your attendance is automatically managed.",
      });
    }

    if (!lat || !long) {
      return res
        .status(400)
        .json({
          message: "GPS coordinates (lat, long) are required for clock-out.",
        });
    }

    // 1. Run core validation queries concurrently
    const [attendance, branchResult] = await Promise.all([
      attendanceRepo.findOne({
        where: {
          user_id: user.id,
          clock_out_time: IsNull(),
        },
        order: { clock_in_time: "DESC" },
      }),
      (async () => {
        let allBranches = appCache.get<Branch[]>(CacheKeys.ALL_BRANCHES);
        if (!allBranches) {
          allBranches = await branchRepo.find();
          if (allBranches && allBranches.length > 0) {
            appCache.set(CacheKeys.ALL_BRANCHES, allBranches);
          }
        }

        if (!allBranches || allBranches.length === 0)
          return { validBranch: null, allBranches: [] };

        const validBranch = allBranches.find(
          (branch) =>
            getDistanceFromLatLonInMeters(
              lat,
              long,
              branch.gps_lat,
              branch.gps_long,
            ) <= branch.radius_meters,
        );
        return { validBranch: validBranch || null, allBranches };
      })(),
    ]);

    if (!attendance) {
      return res
        .status(400)
        .json({ message: "No active clock-in record found to clock out." });
    }

    const { validBranch, allBranches } = branchResult;
    if (!allBranches || allBranches.length === 0) {
      return res.status(403).json({
        message:
          "No branches are available in the system. Please contact an administrator.",
      });
    }

    if (!validBranch) {
      return res.status(403).json({
        message: `You are not within the allowed radius of any office branch to clock out.`,
        suggestion: "Please move closer to an office branch.",
        availableBranches: allBranches.map((b) => ({
          name: b.name,
          address: b.address,
          city: b.location_city,
        })),
      });
    }

    // 3. Calculate hours and update status
    const hoursWorked = calculateHours(attendance.clock_in_time, now);
    const clockOutUtcHour = now.getUTCHours();
    if (clockOutUtcHour < 16 && attendance.status !== AttendanceStatus.LATE) {
      attendance.status = AttendanceStatus.EARLY_EXIT;
    }

    attendance.clock_out_time = now;
    attendance.hours_worked = hoursWorked;
    await attendanceRepo.save(attendance);

    // Notify manager/admins if this was an early exit
    if (attendance.status === AttendanceStatus.EARLY_EXIT) {
      if (user.reports_to_id) {
        req.notify?.(user.reports_to_id, {
          type: "ATTENDANCE",
          title: "Early exit detected",
          body: `${user.name} clocked out early (${hoursWorked} hrs).`,
          payload: { attendanceId: attendance.id },
        });
      } else {
        const admins = await userRepo.find({
          where: [{ role: UserRole.CEO }, { role: UserRole.MD }],
        });
        for (const a of admins) {
          req.notify?.(a.id, {
            type: "ATTENDANCE",
            title: "Early exit detected",
            body: `${user.name} clocked out early (${hoursWorked} hrs) and has no manager assigned.`,
            payload: { attendanceId: attendance.id },
          });
        }
      }
    }

    return res.status(200).json({
      status: "success",
      message: `Clocked out successfully at ${validBranch.name}.`,
      data: {
        start: attendance.clock_in_time,
        end: attendance.clock_out_time,
        hours_worked: hoursWorked,
        attendanceStatus: attendance.status,
        branch: {
          id: validBranch.id,
          name: validBranch.name,
          address: validBranch.address,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Get user's own attendance metrics
export const getMyAttendanceMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const user = req.user!;
    const {
      startDate,
      endDate,
      period = "30",
      page = "1",
      limit = "10",
    } = req.query;

    let dateFilter: any = {};

    if (startDate && endDate) {
      dateFilter = Between(
        new Date(startDate as string),
        new Date(endDate as string),
      );
    } else {
      // Default to last N days (default 30)
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period as string));
      dateFilter = MoreThanOrEqual(daysAgo);
    }

    // Fetch all records (including weekends) to calculate weekend metrics
    const allRecords = await attendanceRepo.find({
      where: {
        user_id: user.id,
        clock_in_time: dateFilter,
      },
      relations: ["branch"],
      order: { clock_in_time: "DESC" },
    });

    // Fetch business day records (weekends excluded) using database-level filtering
    const attendanceRecords = await attendanceRepo
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.branch", "branch")
      .where("attendance.user_id = :userId", { userId: user.id })
      .andWhere("attendance.clock_in_time >= :startDate", {
        startDate: dateFilter instanceof Date ? dateFilter : dateFilter._value,
      })
      .andWhere(getWeekendFilterWhereClause())
      .orderBy("attendance.clock_in_time", "DESC")
      .getMany();

    // Calculate weekend metrics
    const weekendWorkDays = attendanceRecords.filter(
      (r) => r.is_weekend_work,
    ).length;
    const weekendsExcluded = allRecords.length - attendanceRecords.length;

    // Calculate metrics (using database-filtered records)
    const totalDays = attendanceRecords.length;
    const totalHours = attendanceRecords.reduce((sum, record) => {
      return (
        sum +
        (record.hours_worked ? parseFloat(record.hours_worked.toString()) : 0)
      );
    }, 0);

    const presentDays = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const lateDays = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const onLeaveDays = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const earlyExitDays = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.EARLY_EXIT,
    ).length;

    const averageHoursPerDay =
      totalDays > 0 ? (totalHours / totalDays).toFixed(2) : 0;

    // Branch breakdown
    const branchBreakdown: {
      [key: string]: { count: number; hours: number; branchName: string };
    } = {};
    attendanceRecords.forEach((record) => {
      if (record.branch_id) {
        if (!branchBreakdown[record.branch_id]) {
          branchBreakdown[record.branch_id] = {
            count: 0,
            hours: 0,
            branchName: record.branch?.name || "Unknown",
          };
        }
        branchBreakdown[record.branch_id].count++;
        branchBreakdown[record.branch_id].hours += record.hours_worked
          ? parseFloat(record.hours_worked.toString())
          : 0;
      }
    });

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    return res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalDays,
          period: `Last ${period} days`,
          totalHours: totalHours.toFixed(2),
          averageHoursPerDay,
          presentDays,
          lateDays,
          onLeaveDays,
          earlyExitDays,
          attendanceRate:
            totalDays > 0
              ? ((presentDays / totalDays) * 100).toFixed(2) + "%"
              : "0%",
          totalDaysIncludingWeekends: allRecords.length,
          weekendWorkDays,
          businessDaysAttended: totalDays,
          weekendsExcluded,
        },
        branchBreakdown: Object.entries(branchBreakdown).map(
          ([branchId, data]) => ({
            branchId,
            branchName: data.branchName,
            daysAttended: data.count,
            totalHours: data.hours.toFixed(2),
          }),
        ),
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalRecords: attendanceRecords.length,
        },
        recentAttendance: attendanceRecords
          .slice(startIndex, endIndex)
          .map((record) => ({
            id: record.id,
            date: record.clock_in_time,
            clockIn: record.clock_in_time,
            clockOut: record.clock_out_time,
            hoursWorked: record.hours_worked,
            status: record.status,
            branch: record.branch
              ? {
                  id: record.branch.id,
                  name: record.branch.name,
                  address: record.branch.address,
                }
              : null,
            isManualOverride: record.is_manual_override,
            isWeekendWork: record.is_weekend_work,
          })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin: Get attendance metrics for all users or specific user
export const getAttendanceMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const {
      userId,
      startDate,
      endDate,
      period = "30",
      departmentId,
      branchId,
      page = "1",
      limit = "10",
    } = req.query;

    let dateFilter: any = {};

    if (startDate && endDate) {
      dateFilter = Between(
        new Date(startDate as string),
        new Date(endDate as string),
      );
    } else {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period as string));
      dateFilter = MoreThanOrEqual(daysAgo);
    }

    let whereClause: any = {
      clock_in_time: dateFilter,
    };

    if (userId) {
      whereClause.user_id = userId;
    }

    // Fetch all records (including weekends) for total count
    const allRecords = await attendanceRepo.find({
      where: whereClause,
      relations: ["user", "branch", "user.department"],
      order: { clock_in_time: "DESC" },
    });

    // Create query builder for business day records (weekends excluded)
    let query = attendanceRepo
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .leftJoinAndSelect("attendance.branch", "branch")
      .leftJoinAndSelect("user.department", "department")
      .where("attendance.clock_in_time >= :startDate", {
        startDate: dateFilter instanceof Date ? dateFilter : dateFilter._value,
      })
      .andWhere(getWeekendFilterWhereClause())
      .orderBy("attendance.clock_in_time", "DESC");

    if (userId) {
      query = query.andWhere("attendance.user_id = :userId", { userId });
    }

    // Fetch business day records
    const attendanceRecords = await query.getMany();

    // Filter by department or branch if specified
    let filteredRecords = attendanceRecords;
    if (departmentId) {
      filteredRecords = filteredRecords.filter(
        (r) => r.user?.department?.id === departmentId,
      );
      // Also filter allRecords for accurate total comparison
      // Note: In a fully optimized scenario, we would run separate count queries
    }
    if (branchId) {
      filteredRecords = filteredRecords.filter((r) => r.branch_id === branchId);
    }

    // Weekend metrics
    const weekendWorkDays = filteredRecords.filter(
      (r) => r.is_weekend_work,
    ).length;
    // Approximation for weekends excluded if department/branch filters are applied
    // For exact numbers with filters, we'd need to filter allRecords too, but keeping it simple for now
    // or we can just count the difference between what we fetched and what we have

    // To be accurate with filters, let's filter allRecords too
    let filteredAllRecords = allRecords;
    if (departmentId)
      filteredAllRecords = filteredAllRecords.filter(
        (r) => r.user?.department?.id === departmentId,
      );
    if (branchId)
      filteredAllRecords = filteredAllRecords.filter(
        (r) => r.branch_id === branchId,
      );

    const weekendsExcluded = filteredAllRecords.length - filteredRecords.length;

    // Calculate overall metrics
    const totalRecords = filteredRecords.length;
    const totalHours = filteredRecords.reduce((sum, record) => {
      return (
        sum +
        (record.hours_worked ? parseFloat(record.hours_worked.toString()) : 0)
      );
    }, 0);

    const presentCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const lateCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const onLeaveCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const earlyExitCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.EARLY_EXIT,
    ).length;

    // User breakdown
    const userMetrics: { [key: string]: any } = {};
    filteredRecords.forEach((record) => {
      if (!userMetrics[record.user_id]) {
        userMetrics[record.user_id] = {
          userId: record.user_id,
          userName: record.user?.name || "Unknown",
          userEmail: record.user?.email || "Unknown",
          department: record.user?.department?.name || "N/A",
          totalDays: 0,
          totalHours: 0,
          presentDays: 0,
          lateDays: 0,
          onLeaveDays: 0,
          earlyExitDays: 0,
        };
      }

      userMetrics[record.user_id].totalDays++;
      userMetrics[record.user_id].totalHours += record.hours_worked
        ? parseFloat(record.hours_worked.toString())
        : 0;

      if (record.status === AttendanceStatus.PRESENT)
        userMetrics[record.user_id].presentDays++;
      if (record.status === AttendanceStatus.LATE)
        userMetrics[record.user_id].lateDays++;
      if (record.status === AttendanceStatus.ON_LEAVE)
        userMetrics[record.user_id].onLeaveDays++;
      if (record.status === AttendanceStatus.EARLY_EXIT)
        userMetrics[record.user_id].earlyExitDays++;
    });

    // Branch breakdown
    const branchMetrics: { [key: string]: any } = {};
    filteredRecords.forEach((record) => {
      if (record.branch_id) {
        if (!branchMetrics[record.branch_id]) {
          branchMetrics[record.branch_id] = {
            branchId: record.branch_id,
            branchName: record.branch?.name || "Unknown",
            totalAttendance: 0,
            totalHours: 0,
            uniqueUsers: new Set(),
          };
        }

        branchMetrics[record.branch_id].totalAttendance++;
        branchMetrics[record.branch_id].totalHours += record.hours_worked
          ? parseFloat(record.hours_worked.toString())
          : 0;
        branchMetrics[record.branch_id].uniqueUsers.add(record.user_id);
      }
    });

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedUserMetrics = Object.values(userMetrics).slice(
      startIndex,
      endIndex,
    );

    return res.status(200).json({
      status: "success",
      data: {
        overallSummary: {
          totalRecords,
          totalHours: totalHours.toFixed(2),
          averageHoursPerRecord:
            totalRecords > 0 ? (totalHours / totalRecords).toFixed(2) : 0,
          presentCount,
          lateCount,
          onLeaveCount,
          earlyExitCount,
          punctualityRate:
            totalRecords > 0
              ? ((presentCount / totalRecords) * 100).toFixed(2) + "%"
              : "0%",

          totalRecordsIncludingWeekends: filteredAllRecords.length,
          weekendWorkDays,
          businessDaysAttended: totalRecords,
          weekendsExcluded,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalUsers: Object.keys(userMetrics).length,
        },
        userMetrics: paginatedUserMetrics.map((user: any) => ({
          ...user,
          totalHours: user.totalHours.toFixed(2),
          averageHoursPerDay:
            user.totalDays > 0
              ? (user.totalHours / user.totalDays).toFixed(2)
              : 0,
          attendanceRate:
            user.totalDays > 0
              ? ((user.presentDays / user.totalDays) * 100).toFixed(2) + "%"
              : "0%",
        })), // Paginate the user metrics
        branchMetrics: Object.values(branchMetrics).map((branch: any) => ({
          branchId: branch.branchId,
          branchName: branch.branchName,
          totalAttendance: branch.totalAttendance,
          totalHours: branch.totalHours.toFixed(2),
          uniqueUsers: branch.uniqueUsers.size,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin: Create a Branch
export const createBranch = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const branch = branchRepo.create(req.body);
    await branchRepo.save(branch);
    return res.status(201).json({ status: "success", data: branch });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Get all branches (for users to see available locations)
export const getAllBranches = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { page = "1", limit = "10" } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [branches, total] = await branchRepo.findAndCount({
      select: [
        "id",
        "name",
        "address",
        "location_city",
        "gps_lat",
        "gps_long",
        "radius_meters",
      ],
      take: limitNum,
      skip: skip,
      order: { name: "ASC" },
    });

    return res.status(200).json({
      status: "success",
      pagination: {
        total,
        page: pageNum,
      },
      data: branches,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin/ME_QC: Get Daily Attendance Metrics
export const getDailyMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const {
      date,
      userId,
      departmentId,
      branchId,
      page = "1",
      limit = "20",
    } = req.query;

    // Default to today if no date is provided
    const targetDate = date ? new Date(date as string) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Base query for all records (including weekends)
    let baseQuery = attendanceRepo
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .leftJoinAndSelect("attendance.branch", "branch")
      .leftJoinAndSelect("user.department", "department")
      .where("attendance.clock_in_time BETWEEN :startOfDay AND :endOfDay", {
        startOfDay,
        endOfDay,
      })
      .orderBy("attendance.clock_in_time", "ASC");

    if (userId) {
      baseQuery = baseQuery.andWhere("attendance.user_id = :userId", {
        userId,
      });
    }
    if (branchId) {
      baseQuery = baseQuery.andWhere("attendance.branch_id = :branchId", {
        branchId,
      });
    }
    if (departmentId) {
      baseQuery = baseQuery.andWhere("department.id = :departmentId", {
        departmentId,
      });
    }

    // Fetch all records context
    const allRecords = await baseQuery.getMany();

    // Fetch business records (apply weekend filter)
    const attendanceRecords = await baseQuery
      .andWhere(getWeekendFilterWhereClause())
      .getMany();

    // Use database-filtered records
    const filteredRecords = attendanceRecords;

    // Weekend metrics
    const weekendWorkDays = filteredRecords.filter(
      (r) => r.is_weekend_work,
    ).length;
    const weekendsExcluded = allRecords.length - filteredRecords.length;

    // Calculate metrics
    const totalRecords = filteredRecords.length;
    const totalHours = filteredRecords.reduce((sum, record) => {
      return (
        sum +
        (record.hours_worked ? parseFloat(record.hours_worked.toString()) : 0)
      );
    }, 0);

    const presentCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const lateCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const onLeaveCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const absentCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;
    const earlyExitCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.EARLY_EXIT,
    ).length;

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    return res.status(200).json({
      status: "success",
      data: {
        date: targetDate.toISOString().split("T")[0],
        summary: {
          totalEmployees: totalRecords,
          totalHours: totalHours.toFixed(2),
          averageHours:
            totalRecords > 0 ? (totalHours / totalRecords).toFixed(2) : 0,
          presentCount,
          lateCount,
          onLeaveCount,
          absentCount,
          earlyExitCount,
          punctualityRate:
            totalRecords > 0
              ? ((presentCount / totalRecords) * 100).toFixed(2) + "%"
              : "0%",

          totalEmployeesIncludingWeekends: allRecords.length,
          weekendWorkDays,
          businessDaysAttended: totalRecords,
          weekendsExcluded,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalRecords: filteredRecords.length,
          totalPages: Math.ceil(filteredRecords.length / limitNum),
        },
        records: paginatedRecords.map((record) => ({
          id: record.id,
          userId: record.user_id,
          userName: record.user?.name || "Unknown",
          userEmail: record.user?.email || "Unknown",
          department: record.user?.department?.name || "N/A",
          branch: record.branch?.name || "N/A",
          clockIn: record.clock_in_time,
          clockOut: record.clock_out_time,
          hoursWorked: record.hours_worked
            ? parseFloat(record.hours_worked.toString()).toFixed(2)
            : "0.00",
          status: record.status,
          isManualOverride: record.is_manual_override,
          overrideReason: record.override_reason,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin/ME_QC: Get Weekly Attendance Metrics
export const getWeeklyMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const {
      weekStart,
      userId,
      departmentId,
      branchId,
      page = "1",
      limit = "20",
    } = req.query;

    // Calculate week start and end
    let startOfWeek: Date;
    if (weekStart) {
      startOfWeek = new Date(weekStart as string);
    } else {
      // Default to current week (Monday to Sunday)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday
      startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() + diff);
    }
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Base query for all records (including weekends)
    let baseQuery = attendanceRepo
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .leftJoinAndSelect("attendance.branch", "branch")
      .leftJoinAndSelect("user.department", "department")
      .where("attendance.clock_in_time BETWEEN :startOfWeek AND :endOfWeek", {
        startOfWeek,
        endOfWeek,
      })
      .orderBy("attendance.clock_in_time", "DESC");

    if (userId) {
      baseQuery = baseQuery.andWhere("attendance.user_id = :userId", {
        userId,
      });
    }
    if (branchId) {
      baseQuery = baseQuery.andWhere("attendance.branch_id = :branchId", {
        branchId,
      });
    }
    if (departmentId) {
      baseQuery = baseQuery.andWhere("department.id = :departmentId", {
        departmentId,
      });
    }

    // Fetch all records context
    const allRecords = await baseQuery.getMany();

    // Fetch business records (apply weekend filter)
    const attendanceRecords = await baseQuery
      .andWhere(getWeekendFilterWhereClause())
      .getMany();

    // Use database-filtered records
    const filteredRecords = attendanceRecords;

    // Weekend metrics
    const weekendWorkDays = filteredRecords.filter(
      (r) => r.is_weekend_work,
    ).length;
    const weekendsExcluded = allRecords.length - filteredRecords.length;

    // Calculate overall metrics
    const totalRecords = filteredRecords.length;
    const totalHours = filteredRecords.reduce((sum, record) => {
      return (
        sum +
        (record.hours_worked ? parseFloat(record.hours_worked.toString()) : 0)
      );
    }, 0);

    const presentCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const lateCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const onLeaveCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const earlyExitCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.EARLY_EXIT,
    ).length;

    // User breakdown with aggregated weekly data
    const userMetrics: { [key: string]: any } = {};
    filteredRecords.forEach((record) => {
      if (!userMetrics[record.user_id]) {
        userMetrics[record.user_id] = {
          userId: record.user_id,
          userName: record.user?.name || "Unknown",
          userEmail: record.user?.email || "Unknown",
          department: record.user?.department?.name || "N/A",
          totalDays: 0,
          totalHours: 0,
          presentDays: 0,
          lateDays: 0,
          onLeaveDays: 0,
          earlyExitDays: 0,
        };
      }

      userMetrics[record.user_id].totalDays++;
      userMetrics[record.user_id].totalHours += record.hours_worked
        ? parseFloat(record.hours_worked.toString())
        : 0;

      if (record.status === AttendanceStatus.PRESENT)
        userMetrics[record.user_id].presentDays++;
      if (record.status === AttendanceStatus.LATE)
        userMetrics[record.user_id].lateDays++;
      if (record.status === AttendanceStatus.ON_LEAVE)
        userMetrics[record.user_id].onLeaveDays++;
      if (record.status === AttendanceStatus.EARLY_EXIT)
        userMetrics[record.user_id].earlyExitDays++;
    });

    // Pagination for user metrics
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const userMetricsArray = Object.values(userMetrics);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedUserMetrics = userMetricsArray.slice(startIndex, endIndex);

    return res.status(200).json({
      status: "success",
      data: {
        weekStart: startOfWeek.toISOString().split("T")[0],
        weekEnd: endOfWeek.toISOString().split("T")[0],
        summary: {
          totalRecords,
          totalHours: totalHours.toFixed(2),
          averageHoursPerRecord:
            totalRecords > 0 ? (totalHours / totalRecords).toFixed(2) : 0,
          presentCount,
          lateCount,
          onLeaveCount,
          earlyExitCount,
          punctualityRate:
            totalRecords > 0
              ? ((presentCount / totalRecords) * 100).toFixed(2) + "%"
              : "0%",
          uniqueEmployees: Object.keys(userMetrics).length,
          totalRecordsIncludingWeekends: allRecords.length,
          weekendWorkDays,
          businessDaysAttended: totalRecords,
          weekendsExcluded,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalUsers: userMetricsArray.length,
          totalPages: Math.ceil(userMetricsArray.length / limitNum),
        },
        userMetrics: paginatedUserMetrics.map((user: any) => ({
          ...user,
          totalHours: user.totalHours.toFixed(2),
          averageHoursPerDay:
            user.totalDays > 0
              ? (user.totalHours / user.totalDays).toFixed(2)
              : 0,
          attendanceRate:
            user.totalDays > 0
              ? ((user.presentDays / user.totalDays) * 100).toFixed(2) + "%"
              : "0%",
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin/ME_QC: Get Monthly Attendance Metrics
export const getMonthlyMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const {
      year,
      month,
      userId,
      departmentId,
      branchId,
      page = "1",
      limit = "20",
    } = req.query;

    // Calculate month start and end
    const currentDate = new Date();
    const targetYear = year
      ? parseInt(year as string)
      : currentDate.getFullYear();
    const targetMonth = month
      ? parseInt(month as string) - 1
      : currentDate.getMonth(); // month is 0-indexed

    const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(
      targetYear,
      targetMonth + 1,
      0,
      23,
      59,
      59,
      999,
    );

    // Base query for all records (including weekends)
    let baseQuery = attendanceRepo
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .leftJoinAndSelect("attendance.branch", "branch")
      .leftJoinAndSelect("user.department", "department")
      .where("attendance.clock_in_time BETWEEN :startOfMonth AND :endOfMonth", {
        startOfMonth,
        endOfMonth,
      })
      .orderBy("attendance.clock_in_time", "DESC");

    if (userId) {
      baseQuery = baseQuery.andWhere("attendance.user_id = :userId", {
        userId,
      });
    }
    if (branchId) {
      baseQuery = baseQuery.andWhere("attendance.branch_id = :branchId", {
        branchId,
      });
    }
    if (departmentId) {
      baseQuery = baseQuery.andWhere("department.id = :departmentId", {
        departmentId,
      });
    }

    // Fetch all records context
    const allRecords = await baseQuery.getMany();

    // Fetch business records (apply weekend filter)
    const attendanceRecords = await baseQuery
      .andWhere(getWeekendFilterWhereClause())
      .getMany();

    // Use database-filtered records
    const filteredRecords = attendanceRecords;

    // Weekend metrics
    const weekendWorkDays = filteredRecords.filter(
      (r) => r.is_weekend_work,
    ).length;
    const weekendsExcluded = allRecords.length - filteredRecords.length;

    // Calculate overall metrics
    const totalRecords = filteredRecords.length;
    const totalHours = filteredRecords.reduce((sum, record) => {
      return (
        sum +
        (record.hours_worked ? parseFloat(record.hours_worked.toString()) : 0)
      );
    }, 0);

    const presentCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const lateCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const onLeaveCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const earlyExitCount = filteredRecords.filter(
      (r) => r.status === AttendanceStatus.EARLY_EXIT,
    ).length;

    // User breakdown with aggregated monthly data
    const userMetrics: { [key: string]: any } = {};
    filteredRecords.forEach((record) => {
      if (!userMetrics[record.user_id]) {
        userMetrics[record.user_id] = {
          userId: record.user_id,
          userName: record.user?.name || "Unknown",
          userEmail: record.user?.email || "Unknown",
          department: record.user?.department?.name || "N/A",
          totalDays: 0,
          totalHours: 0,
          presentDays: 0,
          lateDays: 0,
          onLeaveDays: 0,
          earlyExitDays: 0,
        };
      }

      userMetrics[record.user_id].totalDays++;
      userMetrics[record.user_id].totalHours += record.hours_worked
        ? parseFloat(record.hours_worked.toString())
        : 0;

      if (record.status === AttendanceStatus.PRESENT)
        userMetrics[record.user_id].presentDays++;
      if (record.status === AttendanceStatus.LATE)
        userMetrics[record.user_id].lateDays++;
      if (record.status === AttendanceStatus.ON_LEAVE)
        userMetrics[record.user_id].onLeaveDays++;
      if (record.status === AttendanceStatus.EARLY_EXIT)
        userMetrics[record.user_id].earlyExitDays++;
    });

    // Department breakdown
    const departmentMetrics: { [key: string]: any } = {};
    filteredRecords.forEach((record) => {
      const deptId = record.user?.department?.id || "N/A";
      const deptName = record.user?.department?.name || "N/A";

      if (!departmentMetrics[deptId]) {
        departmentMetrics[deptId] = {
          departmentId: deptId,
          departmentName: deptName,
          totalAttendance: 0,
          totalHours: 0,
          uniqueUsers: new Set(),
        };
      }

      departmentMetrics[deptId].totalAttendance++;
      departmentMetrics[deptId].totalHours += record.hours_worked
        ? parseFloat(record.hours_worked.toString())
        : 0;
      departmentMetrics[deptId].uniqueUsers.add(record.user_id);
    });

    // Pagination for user metrics
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const userMetricsArray = Object.values(userMetrics);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedUserMetrics = userMetricsArray.slice(startIndex, endIndex);

    return res.status(200).json({
      status: "success",
      data: {
        month: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`,
        monthStart: startOfMonth.toISOString().split("T")[0],
        monthEnd: endOfMonth.toISOString().split("T")[0],
        summary: {
          totalRecords,
          totalHours: totalHours.toFixed(2),
          averageHoursPerRecord:
            totalRecords > 0 ? (totalHours / totalRecords).toFixed(2) : 0,
          presentCount,
          lateCount,
          onLeaveCount,
          earlyExitCount,
          punctualityRate:
            totalRecords > 0
              ? ((presentCount / totalRecords) * 100).toFixed(2) + "%"
              : "0%",
          uniqueEmployees: Object.keys(userMetrics).length,

          totalRecordsIncludingWeekends: allRecords.length,
          weekendWorkDays,
          businessDaysAttended: totalRecords,
          weekendsExcluded,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalUsers: userMetricsArray.length,
          totalPages: Math.ceil(userMetricsArray.length / limitNum),
        },
        userMetrics: paginatedUserMetrics.map((user: any) => ({
          ...user,
          totalHours: user.totalHours.toFixed(2),
          averageHoursPerDay:
            user.totalDays > 0
              ? (user.totalHours / user.totalDays).toFixed(2)
              : 0,
          attendanceRate:
            user.totalDays > 0
              ? ((user.presentDays / user.totalDays) * 100).toFixed(2) + "%"
              : "0%",
        })),
        departmentMetrics: Object.values(departmentMetrics).map(
          (dept: any) => ({
            departmentId: dept.departmentId,
            departmentName: dept.departmentName,
            totalAttendance: dept.totalAttendance,
            totalHours: dept.totalHours.toFixed(2),
            uniqueUsers: dept.uniqueUsers.size,
            averageHoursPerUser:
              dept.uniqueUsers.size > 0
                ? (dept.totalHours / dept.uniqueUsers.size).toFixed(2)
                : 0,
          }),
        ),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
