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
- **Node Management**: Admin-only split inventory view with Ubuntu and Windows columns. Nodes are grouped from the saved OS Family setting, with autodetection fallback from the registered portal inventory.

## 🖥️ Admin Node Views

- `NodesPage`: Shows Slurm-visible compute resources and scheduler status.
- `AdminToolsPage`: Adds, edits, bulk imports, tests, and deletes registered access nodes.
- `NodeManagementPage`: Presents the registered inventory in two responsive columns for HPC administrator review.

Detection logic first uses live backend probes from the registered IP address:
- Windows: RDP/WinRM ports (`3389`, `5985`, `5986`) are reachable.
- Windows fallback signals: SMB/RPC ports (`445`, `135`) are reachable.
- Ubuntu/Linux: SSH is reachable on the saved port or port `22`.

If live detection is unavailable, the admin-selected `OS Family` saved in Slurm Nodes is used. If that is `Auto Detect`, metadata fallback is used:
- Windows: Windows-like node names, Administrator/domain users, or RDP/WinRM ports (`3389`, `5985`, `5986`).
- Ubuntu/Linux: SSH-based nodes without Windows signals.

When a dual-boot or repurposed machine is switched to Windows, refresh `Management -> Node Management`. If the Windows remote ports are blocked, update its OS Family in `Management -> Slurm Nodes` as a fallback.

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
- **Admin**: Full access to the Management hierarchy, including Node Management.
- **Developer**: Access to operational management tools except admin-only Node Management.
- **User**: Restricted to personal dashboard, job submission, and file synchronization.

## 🧩 Key Components
- `NodesPage`: Unified inventory of live Slurm compute fabric.
- `DashboardPage`: High-level cluster health and resource utilization overview.
- `DiagnosticConsolePage`: Professional-grade SSH terminal interface.
- `NodeManagementPage`: Responsive admin inventory grouped into Ubuntu and Windows operational pools.
