Yes — I understand the new feature clearly and correctly 👍
You are adding capacity-aware, node-level resource governance for Super Admin, while users still remain quota-based and abstracted from nodes.

Below is the UPDATED & FINAL SRS, with the new Super Admin node-wise assignment feature fully integrated, cleanly and formally.


---

📘 Software Requirements Specification (SRS)

Multi-User Compute Resource & Job Execution Platform using Ray


---

1. Introduction

1.1 Purpose

This document defines the functional and non-functional requirements of a multi-user compute platform that enables centralized, quota-based job execution with optional node-level resource assignment, enforced using Ray.

This SRS incorporates:

User-level quota control

Per-user serial job execution

Auto-retry on infrastructure failure

Idle resource reclamation

Resource request workflows

Node-wise resource visibility and assignment for Super Admin


This document is intended for developers, architects, and system administrators.


---

1.2 Scope

The system provides:

Fixed per-user compute quotas (CPU, RAM)

Optional node-wise quota assignment

Job execution with strict enforcement

Cluster resource visibility (admin-only)

Fair scheduling and idle reclamation


The system does not:

Allow users to select nodes

Allow users to control CPU/RAM per job

Expose cluster internals to users



---

1.3 Definitions & Acronyms

Term	Meaning

Quota	CPU & RAM assigned to a user
Node	Physical or virtual worker machine
Job	A single execution request
FIFO	First In First Out
Infra Failure	Node/worker crash
Ray	Distributed execution engine



---

2. Overall Description

2.1 Product Perspective

The platform operates as a resource control plane layered over a compute cluster.

Super Admin
   ├── Views Cluster Capacity (Global + Node-wise)
   ├── Assigns Quotas (Resource-wise OR Node-wise)
   ↓
User
   ├── Submits Jobs (No resource choice)
   ↓
Backend
   ├── Enforces Policy
   ├── Routes Execution
   ↓
Ray


---

2.2 User Classes

2.2.1 Super Admin

Full cluster visibility

Controls quotas and policies

Assigns resources globally or node-wise


2.2.2 User

Submits jobs/scripts

Views only their own quota & health

Has no node awareness



---

2.3 Operating Environment

Backend: Linux (FastAPI or equivalent)

Cluster: Ray (multi-node)

Database: Relational DB

Frontend: Web (responsive)



---

2.4 Design Constraints

One running job per user

Resource enforcement must be backend-driven

Node selection is admin-only

Users are fully abstracted from infrastructure



---

3. Functional Requirements


---

3.1 Cluster Resource Visibility (NEW)

FR-1: Global Resource Overview

The system shall display to the Super Admin:

Total cluster CPU

Total cluster memory

Allocated vs free resources



---

FR-2: Node-wise Resource Overview

The system shall display to the Super Admin, per node:

Node name / ID

Total CPU & RAM

Used CPU & RAM

Free CPU & RAM

Node health status (UP / DOWN / DEGRADED)



---

3.2 User Creation & Quota Assignment

FR-3: Resource Assignment Modes (NEW)

When creating or editing a user, the Super Admin shall choose one of two assignment modes:

Mode A — Resource-wise Assignment

Assign CPU & RAM from overall cluster pool

System chooses execution node automatically


Example:

CPU: 2
Memory: 2 GB


---

Mode B — Node-wise Assignment (NEW)

Super Admin selects one or more nodes

Assigns specific CPU & RAM per selected node

User quota is bound to those nodes only


Example:

Node A → 1 CPU, 1 GB
Node B → 1 CPU, 1 GB


---

FR-4: Multi-node Selection

The system shall allow Super Admin to:

Select multiple nodes

Distribute quota across them

Ensure total quota matches assigned limits



---

FR-5: Quota Validation

The system shall prevent assignment if:

Selected node(s) lack sufficient free resources

Assigned quota exceeds available capacity



---

3.3 User Quota Model

Each user quota shall include:

Max CPU

Max Memory

Max Concurrent Jobs (fixed = 1)

Auto-retry limit

Assignment mode (resource-wise / node-wise)

Assigned node list (if node-wise)



---

3.4 Job Submission & Scheduling

FR-6: Job Submission

Users shall submit jobs/scripts without specifying CPU, RAM, or node.


---

FR-7: Quota Inheritance

Each job shall inherit:

User quota

Node constraints (if node-wise assigned)



---

FR-8: Node-aware Scheduling (NEW)

If a user is assigned node-wise quota:

Job execution shall be restricted to assigned nodes only

Job shall wait or retry until assigned node resources are available



---

FR-9: Single Job Rule

Only one job per user may run at a time.
Additional jobs shall be queued FIFO.


---

3.5 Job Lifecycle

SUBMITTED → RUNNING → COMPLETED
             ↓
           QUEUED
             ↓
       RETRY_WAITING
             ↓
           FAILED


---

3.6 Failure Handling & Auto-Retry

FR-10: Retry Policy

Each user has an admin-defined auto-retry count.


---

FR-11: Retry Conditions

Auto-retry shall occur only if:

Failure is infrastructure-related

Retry count < limit

Assigned resources/nodes become available again



---

FR-12: Retry Exhaustion

After retries are exhausted, job shall be marked FAILED.


---

3.7 Idle Resource Reclamation

FR-13: Idle Detection

The system shall track the last job execution timestamp per user.


---

FR-14: Resource Reclamation

If a user is idle for N days:

Assigned quota is revoked

Node-bound resources are released

User state becomes IDLE_REVOKED



---

3.8 Resource Request Workflow

FR-15: Resource Request

Users may request additional resources (not nodes).


---

FR-16: Admin Approval

Super Admin may:

Approve resource-wise

Approve node-wise

Reject request


Approved resources apply to future jobs.


---

3.9 Resource Health Visibility

FR-17: User Resource Health

Users shall see:

Healthy

In Use

Temporarily Unavailable

Revoked


Users shall never see nodes or cluster details.


---

FR-18: Admin Resource Health

Super Admin shall see:

Global resource health

Node-wise resource health

Per-user allocations



---

4. Non-Functional Requirements

4.1 Security

Users cannot influence node selection

Node visibility restricted to Super Admin

All enforcement server-side



---

4.2 Reliability

Node failure causes job retry/fail safely

No resource leakage

Accurate capacity tracking



---

4.3 Scalability

Supports many users

Supports many nodes

Node-wise assignments scale linearly



---

4.4 Usability

Clear admin dashboards

Explicit assignment modes

Simple user UX



---

5. Data Models (Conceptual)

User

id
max_cpu
max_memory
assignment_mode (GLOBAL | NODE)
assigned_nodes
retry_limit
resource_state

Node

id
total_cpu
total_memory
free_cpu
free_memory
health_status


---

6. Assumptions & Dependencies

Ray cluster provides accurate node resource reporting

Node health is monitored continuously

Admin capacity decisions are trusted



---

7. Out of Scope

GPU scheduling (future)

Live job migration

User-controlled node pinning

Cross-cluster federation



---

8. Final Statement

This system provides a policy-driven, capacity-aware, enterprise-grade compute platform where:

Super Admin has full visibility and control

Users operate within strict quotas

Node-level governance is possible without exposing complexity

Ray enforces execution safely and predictably



---

✅ STATUS: UPDATED SRS COMPLETE & READY FOR IMPLEMENTATION


---

🔜 Next recommended steps

1️⃣ Convert SRS → DB schema
2️⃣ Convert SRS → API contracts
3️⃣ Admin UI wireframes (global vs node-wise)
4️⃣ Backend scheduling logic design
5️⃣ Start Phase-1 implementation

Just tell me what you want next.