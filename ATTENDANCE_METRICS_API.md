# Attendance Metrics API Documentation

This document describes the attendance metrics endpoints available for **ADMIN** and **ME_QC** roles.

## Overview

Three new endpoints have been added to provide comprehensive attendance metrics:
- **Daily Metrics**: Get attendance data for a specific day
- **Weekly Metrics**: Get aggregated attendance data for a week
- **Monthly Metrics**: Get aggregated attendance data for a month

All endpoints support:
- ✅ Pagination
- ✅ Filtering by user, department, and branch
- ✅ Role-based access control (ADMIN and ME_QC only)

---

## Endpoints

### 1. Daily Metrics

**Endpoint**: `GET /api/attendance/metrics/daily`

**Access**: ADMIN, ME_QC only

**Description**: Retrieves attendance records for a specific day with detailed breakdown.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string (YYYY-MM-DD) | No | Today | The date to get metrics for |
| `userId` | string | No | - | Filter by specific user ID |
| `departmentId` | string | No | - | Filter by department ID |
| `branchId` | string | No | - | Filter by branch ID |
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 20 | Number of records per page |

#### Example Request

```bash
GET /api/attendance/metrics/daily?date=2026-01-08&page=1&limit=20
```

#### Example Response

```json
{
  "status": "success",
  "data": {
    "date": "2026-01-08",
    "summary": {
      "totalEmployees": 45,
      "totalHours": "360.50",
      "averageHours": "8.01",
      "presentCount": 40,
      "lateCount": 5,
      "onLeaveCount": 0,
      "absentCount": 0,
      "punctualityRate": "88.89%"
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
        "clockOut": "2026-01-08T17:30:00.000Z",
        "hoursWorked": "9.00",
        "status": "PRESENT",
        "isManualOverride": false,
        "overrideReason": null
      }
      // ... more records
    ]
  }
}
```

---

### 2. Weekly Metrics

**Endpoint**: `GET /api/attendance/metrics/weekly`

**Access**: ADMIN, ME_QC only

**Description**: Retrieves aggregated attendance metrics for a week (Monday to Sunday).

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `weekStart` | string (YYYY-MM-DD) | No | Current week Monday | Start date of the week (Monday) |
| `userId` | string | No | - | Filter by specific user ID |
| `departmentId` | string | No | - | Filter by department ID |
| `branchId` | string | No | - | Filter by branch ID |
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 20 | Number of user records per page |

#### Example Request

```bash
GET /api/attendance/metrics/weekly?weekStart=2026-01-06&page=1&limit=20
```

#### Example Response

```json
{
  "status": "success",
  "data": {
    "weekStart": "2026-01-06",
    "weekEnd": "2026-01-12",
    "summary": {
      "totalRecords": 225,
      "totalHours": "1800.50",
      "averageHoursPerRecord": "8.00",
      "presentCount": 200,
      "lateCount": 25,
      "onLeaveCount": 0,
      "punctualityRate": "88.89%",
      "uniqueEmployees": 45
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalUsers": 45,
      "totalPages": 3
    },
    "userMetrics": [
      {
        "userId": "user-uuid",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "department": "Engineering",
        "totalDays": 5,
        "totalHours": "40.00",
        "presentDays": 4,
        "lateDays": 1,
        "onLeaveDays": 0,
        "averageHoursPerDay": "8.00",
        "attendanceRate": "80.00%"
      }
      // ... more user metrics
    ]
  }
}
```

---

### 3. Monthly Metrics

**Endpoint**: `GET /api/attendance/metrics/monthly`

**Access**: ADMIN, ME_QC only

**Description**: Retrieves aggregated attendance metrics for a month with department breakdown.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | number | No | Current year | Year for the metrics |
| `month` | number (1-12) | No | Current month | Month for the metrics |
| `userId` | string | No | - | Filter by specific user ID |
| `departmentId` | string | No | - | Filter by department ID |
| `branchId` | string | No | - | Filter by branch ID |
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 20 | Number of user records per page |

#### Example Request

```bash
GET /api/attendance/metrics/monthly?year=2026&month=1&page=1&limit=20
```

#### Example Response

```json
{
  "status": "success",
  "data": {
    "month": "2026-01",
    "monthStart": "2026-01-01",
    "monthEnd": "2026-01-31",
    "summary": {
      "totalRecords": 900,
      "totalHours": "7200.00",
      "averageHoursPerRecord": "8.00",
      "presentCount": 800,
      "lateCount": 100,
      "onLeaveCount": 0,
      "punctualityRate": "88.89%",
      "uniqueEmployees": 45
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalUsers": 45,
      "totalPages": 3
    },
    "userMetrics": [
      {
        "userId": "user-uuid",
        "userName": "John Doe",
        "userEmail": "john@example.com",
        "department": "Engineering",
        "totalDays": 20,
        "totalHours": "160.00",
        "presentDays": 18,
        "lateDays": 2,
        "onLeaveDays": 0,
        "averageHoursPerDay": "8.00",
        "attendanceRate": "90.00%"
      }
      // ... more user metrics
    ],
    "departmentMetrics": [
      {
        "departmentId": "dept-uuid",
        "departmentName": "Engineering",
        "totalAttendance": 400,
        "totalHours": "3200.00",
        "uniqueUsers": 20,
        "averageHoursPerUser": "160.00"
      }
      // ... more department metrics
    ]
  }
}
```

---

## Authentication

All endpoints require:
1. **JWT Token**: Include in the `Authorization` header as `Bearer <token>`
2. **Role**: User must have either `ADMIN` or `ME_QC` role

### Example Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "message": "Not authorized, no token"
}
```

### 403 Forbidden
```json
{
  "message": "Not authorized to access this route"
}
```

### 500 Internal Server Error
```json
{
  "message": "Error message details"
}
```

---

## Use Cases

### 1. Daily Attendance Report
Get today's attendance for all employees:
```bash
GET /api/attendance/metrics/daily
```

### 2. Department Weekly Performance
Get weekly metrics for a specific department:
```bash
GET /api/attendance/metrics/weekly?departmentId=dept-uuid&page=1&limit=50
```

### 3. Monthly Branch Analysis
Get monthly metrics for a specific branch:
```bash
GET /api/attendance/metrics/monthly?year=2026&month=1&branchId=branch-uuid
```

### 4. Individual Employee Monthly Report
Get monthly attendance for a specific employee:
```bash
GET /api/attendance/metrics/monthly?userId=user-uuid&year=2026&month=1
```

---

## Notes

- All date/time values are returned in ISO 8601 format
- Hours are calculated and displayed with 2 decimal places
- Pagination is implemented to handle large datasets efficiently
- The default page size is 20 records, but can be adjusted up to a reasonable limit
- Week starts on Monday and ends on Sunday
- If no date parameters are provided, the endpoints default to the current period

---

## Comparison with Existing `/metrics` Endpoint

| Feature | `/metrics` | `/metrics/daily` | `/metrics/weekly` | `/metrics/monthly` |
|---------|-----------|------------------|-------------------|-------------------|
| Time Period | Custom (via period param) | Single day | 7 days (Mon-Sun) | Full month |
| Default Period | Last 30 days | Today | Current week | Current month |
| User Breakdown | ✅ | ✅ | ✅ | ✅ |
| Branch Breakdown | ✅ | ❌ | ❌ | ❌ |
| Department Breakdown | ❌ | ❌ | ❌ | ✅ |
| Individual Records | ❌ | ✅ | ❌ | ❌ |
| Pagination | User metrics only | Records | User metrics | User metrics |

---

## Migration Notes

The existing `/metrics` endpoint remains unchanged and continues to work as before. The new endpoints provide more specialized views:

- Use `/metrics/daily` for detailed daily attendance tracking
- Use `/metrics/weekly` for weekly performance reviews
- Use `/metrics/monthly` for monthly reports and department analysis
- Use `/metrics` for custom date ranges and general overview
