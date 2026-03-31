# Frontend Dashboard // Strach Portal

High-fidelity management interface built with React, TypeScript, and Vite. Designed for professional cluster administration and research workload supervision.

## 🏗️ UI Architecture
- **Design System**: Monotonic, high-density HUD inspired by modern observability platforms (Datadog).
- **Core Components**: Radix UI primitives with Tailwind CSS styling.
- **Routing**: RBAC-aware navigation via `react-router-dom`.
- **State**: React Context for authentication and global telemetry status.

## 📂 Navigation Hierarchy (Management Console)
The dashboard organizes all administrative tools under the `Management` parent section in the sidebar:
- **Platform Config**: Slurm REST v0.0.44 integration, sync intervals, and cluster metadata.
- **Job Setting**: Global resource constraints for concurrent user workloads.
- **Admin Tools**:
    - **Inventory Registry**: Manual node registration for diagnostic terminal access.
    - **Diagnostic Console**: Low-latency terminal interface for cluster interrogation.

## 🚀 Development & Build

### Local Setup
```bash
npm install
npm run dev
```

### Environment Variables
Configure `.env` or Docker environment:
- `VITE_API_URL`: Backend API endpoint (e.g., `http://localhost:8000`).

## 🔐 Role-Based Access Control (RBAC)
- **Admin/Developer**: Full access to the Management hierarchy and Slurm configuration.
- **User**: Restricted to personal dashboard, job submission, and file synchronization.

## 🧩 Key Components
- `NodesPage`: Unified inventory of live Slurm compute fabric.
- `DashboardPage`: High-level cluster health and resource utilization overview.
- `DiagnosticConsolePage`: Professional-grade SSH terminal interface.
