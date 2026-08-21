# Frontend Guide — Strach Portal

React + TypeScript + Vite management interface for the cluster portal: a
high-density administrative console for researchers and HPC administrators.

## Technology

| Aspect | Choice |
| --- | --- |
| Framework | React 18 + TypeScript + Vite |
| Components | Radix UI primitives with Tailwind CSS styling |
| Routing | `react-router-dom` with RBAC-aware navigation |
| State | React Context for authentication and global telemetry status |
| Design language | Monotonic, high-density HUD inspired by observability platforms |

## UI Architecture

The dashboard organizes all administrative tools under the `Management` parent
section in the sidebar:

| Section | Purpose |
| --- | --- |
| Platform Config | Slurm REST v0.0.44 integration, sync intervals, cluster metadata. |
| Job Setting | Global resource constraints for concurrent user workloads. |
| Admin Tools → Inventory Registry | Manual node registration for diagnostic terminal access. |
| Admin Tools → Diagnostic Console | Low-latency SSH terminal interface for cluster interrogation. |
| Node Management | Admin-only split inventory view with Ubuntu and Windows columns. |

## Admin Node Views

- `NodesPage` — Slurm-visible compute resources and scheduler status.
- `AdminToolsPage` — add, edit, bulk import, test, and delete registered
  access nodes.
- `NodeManagementPage` — registered inventory in two responsive columns
  (Ubuntu / Windows) for administrator review.

### OS detection logic

Grouping is decided in this order:

1. **Live backend probes** against the registered IP address:
   - Windows: RDP/WinRM ports (`3389`, `5985`, `5986`) reachable.
   - Windows fallback signals: SMB/RPC ports (`445`, `135`) reachable.
   - Ubuntu/Linux: SSH reachable on the saved port or port `22`.
2. **Saved OS Family** from `Management -> Slurm Nodes`, when live probes are
   unavailable.
3. **Metadata fallback** when OS Family is `Auto Detect`:
   - Windows-like node names, Administrator/domain users, or RDP/WinRM ports.
   - Otherwise Ubuntu/Linux (SSH-based nodes without Windows signals).

Operational note: after switching a dual-boot machine to Windows, refresh
`Management -> Node Management`. If Windows remote ports are blocked by the
network, update its OS Family manually in `Management -> Slurm Nodes`.

## Role-Based Access Control

| Role | Access |
| --- | --- |
| Admin | Full Management hierarchy including Node Management. |
| Developer | Operational management tools except admin-only Node Management. |
| User | Personal dashboard, job submission, file synchronization. |

## Design System

The visual language targets a mission-critical aesthetic: high-density
telemetry on a light "glassmorphism" theme.

### Color palette

| Token | Value | Usage |
| --- | --- | --- |
| Primary accent | `#14b8a6` (teal/emerald) | Primary actions, success states, branding |
| Background | `hsl(210 20% 98%)` | Dashboard background |
| Surface | `#ffffff` | Content panels/cards |
| Border | `hsl(214 14% 85%)` | Subtle separators |
| Text main | `hsl(222 15% 10%)` | Primary text (deep charcoal) |
| Text muted | `hsl(215 15% 40%)` | Secondary text |

### Layouts

**Admin/Developer layout (`Layout.tsx`)** — built for intensive management:
fixed-width 60px sidebar with white background and gray right border; active
tabs use high contrast; a thin sticky sub-header (`h-14`) shows page name and
user profile pill.

**User layout (`UserLayout.tsx`)** — header-driven to maximize code/log
workspace; shares the same `h-14` height, padding, and profile pill styling as
the admin layout.

### Component patterns

**Cards (`frappe-card`)** — rounded corners (`radius-lg`), subtle elevation
(`shadow-n8n`), hover transition to primary-tinted border/glow.

**Tables (`frappe-table`)** — high-density spacing (`py-2.5`), uppercase
tracking-wide headers for a terminal-metadata look, row hover for scanability.

**Active tab visibility (current standard):**

```tsx
isActive
    ? "bg-white text-black shadow-md font-bold border-2 border-black rounded-lg"
    : "text-gray-600 hover:bg-gray-100 border-2 border-transparent"
```

This keeps navigation unmistakably visible on clean light backgrounds.

### Key design tokens (Tailwind v4)

- `--shadow-accent` — teal glow for focused elements.
- `--shadow-n8n` — minimal elevation shadow.
- `--font-mono` — JetBrains Mono for node names, IDs, and log telemetry.

## Dynamic Branding

Global branding sync driven from Platform Config:

1. **Cluster name** — synced across sidebar and user header.
2. **Broadcast message** — subtitle in the header (for example
   "HPC Cluster" or "Development Lab").
3. **Maintenance banner** — high-visibility orange banner (`sticky top-0`)
   shown globally while Maintenance Mode is active.

## Development And Build

```bash
npm install
npm run dev
```

Environment variables (in `.env` or Docker environment):

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_URL` | Backend API endpoint | `http://localhost:8000` |
