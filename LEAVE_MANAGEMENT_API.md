# Leave Management API Documentation

This document describes the leave management endpoints available for staff and managers.

## Overview

The leave management system allows employees to request leave and handles a hierarchical approval process. Leave balance is automatically tracked and deducted upon final approval.

---

## Endpoints

### 1. Request Leave

**Endpoint**: `POST /api/leave`

**Access**: Any authenticated user

**Description**: Submits a new leave request.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Type of leave (e.g., Annual, Sick, Personal) |
| `reason` | string | Yes | Reason for the request |
| `start_date` | string (ISO Date) | Yes | Start date of leave |
| `end_date` | string (ISO Date) | Yes | End date of leave |

#### Example Request

```json
{
  "type": "Annual",
  "reason": "Family vacation",
  "start_date": "2026-02-01",
  "end_date": "2026-02-10"
}
```

---

### 2. Get Pending Approvals

**Endpoint**: `GET /api/leave/pending`

**Access**: Managers/Approvers

**Description**: Retrieves all leave requests currently awaiting approval from the authenticated user.

#### Example Response

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid-123",
      "user_id": "user-uuid",
      "type": "Annual",
      "start_date": "2026-02-01",
      "end_date": "2026-02-10",
      "status": "PENDING",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

---

### 3. Respond to Leave Request

**Endpoint**: `PUT /api/leave/:requestId/respond`

**Access**: Current assigned approver

**Description**: Approves or rejects a leave request.

#### Path Parameters

| Parameter | Description |
|-----------|-------------|
| `requestId` | The ID of the leave request |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Either `"APPROVE"` or `"REJECT"` |

---

## Hierarchical Approval Logic

1. **Initiation**: Request is assigned to the user's direct manager (`reports_to_id`).
2. **Intermediate Approval**: If a manager approves and they are not a "Major Head", the request is escalated to their own manager.
3. **Final Approval**: When a "Major Head" (`ADMIN`, `ME_QC`, `CEO`, or `DEPARTMENT_HEAD`) approves, the request status is set to `APPROVED`.
4. **Balance Deduction**: Leave balance is automatically deducted from the requester's profile only after **final approval**.
5. **Rejection**: If any approver rejects at any stage, the status is immediately set to `REJECTED`.

## Leave Balance

- Users cannot request more leave than their current `leave_balance`.
- CEO requests are automatically approved and balance is deducted immediately.

## Rules Summary

- **Auto-Approval**: Only for CEO.
- **Escalation**: System automatically finds the next manager to approve unless the current approver is a Major Head.
- **Manager Required**: Users must have a manager assigned (`reports_to_id`) to submit a request, unless they are the CEO.
