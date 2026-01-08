# Attendance Status Tracking Update

## Overview

This update enhances the attendance tracking system to properly track all attendance statuses including **PRESENT**, **LATE**, **ABSENT**, **ON_LEAVE**, and the newly added **EARLY_EXIT** status.

## Changes Made

### 1. Entity Changes

#### Attendance Entity (`src/entities/Attendance.ts`)

**Added new status**: `EARLY_EXIT`

```typescript
export enum AttendanceStatus {
  PRESENT = "PRESENT",
  LATE = "LATE",
  ABSENT = "ABSENT",
  ON_LEAVE = "ON_LEAVE",
  EARLY_EXIT = "EARLY_EXIT"  // NEW
}
```

### 2. Business Logic Updates

#### Clock-In Logic (`clockIn` function)

**Rule**: Employees are marked as **LATE** if they clock in after 9:00 AM

```typescript
// If current time is 9:01 AM or later, mark as LATE
if (now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0)) {
  status = AttendanceStatus.LATE;
}
```

#### Clock-Out Logic (`clockOut` function)

**Changes**:
1. **Removed 5 PM restriction** - Employees can now clock out at any time
2. **Added early exit detection** - Employees are marked as **EARLY_EXIT** if they clock out before 4:00 PM

```typescript
// Check for early exit (before 4:00 PM)
// Only mark as EARLY_EXIT if they weren't already LATE
// Priority: LATE > EARLY_EXIT > PRESENT
if (now.getHours() < 16 && attendance.status !== AttendanceStatus.LATE) {
  attendance.status = AttendanceStatus.EARLY_EXIT;
}
```

**Status Priority**:
- If an employee is LATE (clocked in after 9 AM), they remain LATE even if they leave early
- If an employee was PRESENT (clocked in on time) but leaves before 4 PM, they become EARLY_EXIT

### 3. Metrics Updates

All metrics endpoints now track and report early exit counts:

#### Updated Endpoints:
- `GET /api/attendance/my-metrics` - User's own metrics
- `GET /api/attendance/metrics` - Admin metrics (all users)
- `GET /api/attendance/metrics/daily` - Daily metrics
- `GET /api/attendance/metrics/weekly` - Weekly metrics
- `GET /api/attendance/metrics/monthly` - Monthly metrics

#### New Fields in Responses:

**Summary Level**:
```json
{
  "summary": {
    "presentCount": 40,
    "lateCount": 5,
    "onLeaveCount": 0,
    "absentCount": 0,
    "earlyExitCount": 3  // NEW
  }
}
```

**User Level**:
```json
{
  "userMetrics": [{
    "presentDays": 18,
    "lateDays": 2,
    "onLeaveDays": 0,
    "earlyExitDays": 1  // NEW
  }]
}
```

### 4. Database Migration

**Migration File**: `src/migrations/1736338768000-AddEarlyExitStatus.ts`

This migration adds the `EARLY_EXIT` value to the PostgreSQL enum type for attendance status.

**To run the migration**:
```bash
npm run migration:run
```

**For Render deployment**, the migration will run automatically during the build process if you have the deploy script configured:
```json
{
  "scripts": {
    "deploy": "npm run build && npm run migration:run"
  }
}
```

## Attendance Rules Summary

| Status | Condition |
|--------|-----------|
| **PRESENT** | Clocked in at or before 9:00 AM AND clocked out at or after 4:00 PM |
| **LATE** | Clocked in after 9:00 AM (takes priority over EARLY_EXIT) |
| **EARLY_EXIT** | Clocked in on time but clocked out before 4:00 PM |
| **ABSENT** | No clock-in record for the day |
| **ON_LEAVE** | Employee has an approved leave request |

## API Response Examples

### Clock-Out Response (with status)

```json
{
  "status": "success",
  "message": "Clocked out successfully at Main Office.",
  "data": {
    "start": "2026-01-08T08:30:00.000Z",
    "end": "2026-01-08T15:30:00.000Z",
    "hours_worked": 7.0,
    "attendanceStatus": "EARLY_EXIT",  // NEW FIELD
    "branch": {
      "id": "branch-uuid",
      "name": "Main Office",
      "address": "123 Main St"
    }
  }
}
```

### Daily Metrics Response

```json
{
  "status": "success",
  "data": {
    "date": "2026-01-08",
    "summary": {
      "totalEmployees": 45,
      "totalHours": "360.50",
      "averageHours": "8.01",
      "presentCount": 37,
      "lateCount": 5,
      "onLeaveCount": 0,
      "absentCount": 0,
      "earlyExitCount": 3,  // NEW
      "punctualityRate": "82.22%"
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalRecords": 45,
      "totalPages": 3
    },
    "records": [
      {
        "id": "uuid-123",
        "userId": "user-uuid",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "department": "Engineering",
        "branch": "Main Office",
        "clockIn": "2026-01-08T08:30:00.000Z",
        "clockOut": "2026-01-08T15:30:00.000Z",
        "hoursWorked": "7.00",
        "status": "EARLY_EXIT",  // Can be PRESENT, LATE, EARLY_EXIT, etc.
        "isManualOverride": false,
        "overrideReason": null
      }
    ]
  }
}
```

### Monthly Metrics Response

```json
{
  "status": "success",
  "data": {
    "month": "2026-01",
    "summary": {
      "totalRecords": 900,
      "totalHours": "7200.00",
      "presentCount": 800,
      "lateCount": 70,
      "onLeaveCount": 10,
      "earlyExitCount": 20,  // NEW
      "punctualityRate": "88.89%",
      "uniqueEmployees": 45
    },
    "userMetrics": [
      {
        "userId": "user-uuid",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "department": "Engineering",
        "totalDays": 20,
        "totalHours": "160.00",
        "presentDays": 17,
        "lateDays": 2,
        "onLeaveDays": 0,
        "earlyExitDays": 1,  // NEW
        "averageHoursPerDay": "8.00",
        "attendanceRate": "85.00%"
      }
    ]
  }
}
```

## Testing Checklist

### Clock-In Tests
- [ ] Clock in before 9:00 AM → Status should be PRESENT
- [ ] Clock in at exactly 9:00 AM → Status should be PRESENT
- [ ] Clock in at 9:01 AM or later → Status should be LATE

### Clock-Out Tests
- [ ] Clock out before 4:00 PM (with PRESENT status) → Status should change to EARLY_EXIT
- [ ] Clock out at or after 4:00 PM (with PRESENT status) → Status should remain PRESENT
- [ ] Clock out before 4:00 PM (with LATE status) → Status should remain LATE
- [ ] Clock out at any time (with LATE status) → Status should remain LATE

### Metrics Tests
- [ ] All metrics endpoints return earlyExitCount in summary
- [ ] User metrics include earlyExitDays
- [ ] Daily metrics show correct early exit counts
- [ ] Weekly metrics aggregate early exits correctly
- [ ] Monthly metrics aggregate early exits correctly

## Migration Instructions

### Local Development

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Run the migration**:
   ```bash
   npm run migration:run
   ```

3. **Verify the migration**:
   ```bash
   npm run migration:show
   ```

### Render Deployment

The migration will run automatically during deployment if your `package.json` has:

```json
{
  "scripts": {
    "build": "tsc",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d database/data-source.ts",
    "deploy": "npm run build && npm run migration:run",
    "start": "node dist/src/server.js"
  }
}
```

**Render Build Command**: `npm run deploy`
**Render Start Command**: `npm start`

### Rollback (if needed)

**Note**: PostgreSQL does not support removing enum values directly. If you need to rollback:

1. **Option 1**: Restore from database backup
2. **Option 2**: Create a new migration that:
   - Creates a new enum without EARLY_EXIT
   - Updates all EARLY_EXIT records to PRESENT
   - Alters the column to use the new enum
   - Drops the old enum

## Files Modified

1. **src/entities/Attendance.ts** - Added EARLY_EXIT to enum
2. **src/controllers/attendance.controller.ts** - Updated all metrics functions
3. **src/migrations/1736338768000-AddEarlyExitStatus.ts** - New migration file

## Breaking Changes

**None**. This is a backward-compatible addition:
- Existing attendance records remain unchanged
- New enum value is added without affecting existing values
- All existing API responses now include additional fields (earlyExitCount, earlyExitDays)

## Performance Considerations

- No performance impact on existing queries
- Filtering by status includes the new EARLY_EXIT value
- All metrics calculations include early exit counts with minimal overhead

## Future Enhancements

Potential improvements for consideration:
1. Configurable clock-in time (currently hardcoded to 9:00 AM)
2. Configurable clock-out time (currently hardcoded to 4:00 PM)
3. Different rules for different departments or roles
4. Grace period for late arrivals (e.g., 5-minute buffer)
5. Notifications for early exits
6. Manager approval workflow for early exits
