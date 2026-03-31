# 🚀 HPC Portal - Frontend Design System Documentation

A high-fidelity, production-grade interface for managing cluster jobs, users, and resources. This document serves as a reference for the design language, layout architecture, and styling patterns used in the project.

## 🎨 Design Philosophy
The UI is inspired by modern observability platforms (like **Datadog**) and orchestration tools (like **n8n**), blending a mission-critical aesthetic with high-density telemetry and a sleek "glassmorphism" light theme.

### Color Palette
- **Primary Accent**: `#14b8a6` (Teal/Emerald) - Used for primary actions, success states, and branding.
- **Background (Light)**: `hsl(210 20% 98%)` (Soft White/Gray) - Core dashboard background.
- **Surface (Card)**: `#ffffff` (Pure White) - Used for content panels.
- **Border**: `hsl(214 14% 85%)` - Subtle separators.
- **Text (Main)**: `hsl(222 15% 10%)` (Deep Charcoal).
- **Text (Muted)**: `hsl(215 15% 40%)` (Medium Gray).

## 🏗️ Layout Architecture

### 1. Admin / Developer Layout (`Layout.tsx`)
Designed for intensive management tasks.
- **Sidebar**: Fixed-width (60px) vertical navigation. Features a white background with a gray right-border.
- **Active State**: High-contrast active tab visibility using a **2px solid black border** and bold typography.
- **Desktop Header**: A thin, sticky sub-header (`h-14`) displaying the current page name and user profile pill.

### 2. User Layout (`UserLayout.tsx`)
Designed for researchers and job submitters.
- **Top Navigation**: A streamlined header-driven layout to maximize code/logs workspace.
- **Header Structure**: Matches the "sidebar theme" (White background, light gray bottom border).
- **Uniformity**: Shares the same `h-14` height, padding, and user profile pill styling as the Admin layout.

## 💎 Component Design System

### Cards (`frappe-card`)
- Rounded corners (`radius-lg`).
- Subtle shadow (`shadow-n8n`).
- Hover state transitions to a primary-tinted border and glow.

### Tables (`frappe-table`)
- High-density spacing (`py-2.5`).
- Uppercase, tracking-wide headers for a "terminal" metadata look.
- Row hover effects for better scanability.

### Active Tab Visibility (Current Standard)
```tsx
isActive 
    ? "bg-white text-black shadow-md font-bold border-2 border-black rounded-lg" 
    : "text-gray-600 hover:bg-gray-100 border-2 border-transparent"
```
This specific pattern ensures navigation is unmistakably visible even on clean, light backgrounds.

## 💡 Key Design Tokens (Tailwind v4)
- `--shadow-accent`: Teal glow for focused elements.
- `--shadow-n8n`: Minimal elevation shadow.
- `--font-mono`: JetBrains Mono, used for node names, IDs, and log telemetry.

## 🛠️ Dynamic Branding System
The portal implements a global branding sync:
1. **Cluster Name**: Managed via Platform Config, synced across sidebar and user header.
2. **Broadcast Message**: Displayed as a subtitle in the header, used for "HPC Cluster" or "Development Lab" designations.
3. **Maintenance Banner**: A high-visibility orange banner (`sticky top-0`) that appears globally when Maintenance Mode is toggled.

---

*This documentation is intended for future developers to maintain visual consistency when building new modules for the HPC Portal.*
