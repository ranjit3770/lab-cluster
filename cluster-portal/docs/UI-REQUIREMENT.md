You are redesigning the UI of an existing application.

IMPORTANT:
This is a UI/UX redesign only.

DO NOT change, remove, rename, or modify:
- Any API endpoints
- API request/response structures
- HTTP methods
- Authentication or authorization logic
- Validation logic
- Business logic
- Database operations
- State-management behavior
- Existing functionality
- Existing workflows
- Routing behavior
- WebSocket/realtime behavior
- File upload/download behavior
- Error-handling behavior
- Permission checks
- Backend code

The application must behave exactly the same after the redesign.

==================================================
OBJECTIVE
==================================================

Redesign the existing frontend into a reusable, professional enterprise UI inspired by the design philosophy of Frappe Framework.

Do NOT copy Frappe branding or make the application look like Frappe.

Instead, extract the useful design principles:

- Clean enterprise interface
- Information-dense but organized layouts
- Consistent navigation
- Reusable components
- Clear hierarchy
- Structured forms
- Professional tables/lists
- Clear status indicators
- Predictable workflows
- Practical dashboards
- Consistent spacing and typography
- Light and dark theme support
- Responsive design
- Accessibility
- Minimal unnecessary decoration

The result should feel like a mature enterprise application, not a marketing website.

==================================================
PHASE 1 — INSPECT BEFORE CHANGING
==================================================

First inspect the entire existing frontend.

Understand:

1. Application structure
2. Existing routes
3. Existing pages
4. Existing components
5. Existing layouts
6. Existing API calls
7. Existing hooks
8. Existing state management
9. Existing forms
10. Existing validation
11. Existing tables
12. Existing dialogs/modals
13. Existing loading/error states
14. Existing authentication flow
15. Existing permissions
16. Existing responsive behavior

Do NOT start rewriting immediately.

Build a mental map of:

Route → Page → Components → State → API → User action

Before modifying anything, identify which code is responsible for functionality and which code is purely presentational.

The safest approach is to modify presentation/components while keeping functional logic intact.

==================================================
PHASE 2 — ESTABLISH A REUSABLE DESIGN SYSTEM
==================================================

Create or improve a centralized UI design system.

Do not scatter arbitrary CSS values throughout the application.

Create reusable design tokens for:

COLOR
- primary
- secondary
- background
- surface
- surface-elevated
- border
- text-primary
- text-secondary
- text-muted
- success
- warning
- danger
- info

TYPOGRAPHY
- font family
- xs
- sm
- md
- lg
- xl
- 2xl
- heading weights
- body weights
- line heights

SPACING
- xs
- sm
- md
- lg
- xl
- 2xl

OTHER
- border radius
- border width
- shadows
- transitions
- focus rings
- breakpoints

Use semantic tokens rather than hard-coded colors throughout components.

==================================================
PHASE 3 — APPLICATION SHELL
==================================================

Create a consistent application shell.

Structure:

Sidebar
    ↓
Top Header
    ↓
Breadcrumb
    ↓
Page Header
    ↓
Page Content

Recommended structure:

┌─────────────────────────────────────────────────────┐
│ Sidebar │ Top Header                               │
│         ├───────────────────────────────────────────│
│         │ Breadcrumb                                │
│         │                                           │
│         │ Page Title                    Actions     │
│         │ Description                               │
│         │                                           │
│         │ ┌───────────────────────────────────────┐ │
│         │ │                                       │ │
│         │ │            Page Content               │ │
│         │ │                                       │ │
│         │ └───────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

Sidebar requirements:
- Clean navigation
- Clear active state
- Logical grouping
- Nested navigation where required
- Collapsed mode
- Expanded mode
- Tooltips when collapsed
- Responsive behavior
- Do not remove existing routes
- Do not change route behavior

Header can contain existing:
- Search
- Notifications
- User menu
- Theme toggle
- Help
- Environment information

Only display functionality that already exists.

DO NOT invent new backend functionality.

==================================================
PHASE 4 — PAGE DESIGN
==================================================

Every major page should follow a consistent hierarchy:

Breadcrumb

Page Title
Short description

Primary Action / Secondary Actions

--------------------------------

Search / Filters

--------------------------------

Main Content

Example:

Projects

Manage projects and project resources.

[ + New Project ]

Search projects...    Status ▾    Owner ▾

--------------------------------

Project Name    Owner      Status      Updated
Project A       User A     Active      2h ago
Project B       User B     Pending     1d ago

Do not add fake data.

Use the application's existing data.

==================================================
PHASE 5 — REUSABLE COMPONENTS
==================================================

Create/reuse a consistent component system.

Foundation:

- Button
- Icon
- Typography
- Badge
- Avatar
- Tooltip
- Divider
- Skeleton
- Spinner

Forms:

- Input
- Textarea
- Select
- Multi-select
- Checkbox
- Radio
- Switch
- Date picker
- File upload
- Search input

Navigation:

- Sidebar
- Header
- Breadcrumb
- Tabs
- Dropdown
- Menu
- Pagination

Data:

- Table
- Data grid
- Filters
- Sorting
- Pagination
- Empty state
- Loading state
- Error state

Feedback:

- Toast
- Alert
- Banner
- Modal
- Confirmation dialog
- Progress
- Error state
- Success state

Business patterns where applicable:

- Status badge
- Activity log
- Timeline
- Audit log
- Workflow stepper
- Metric card

Do not create duplicate components when an equivalent component already exists.

==================================================
PHASE 6 — TABLES
==================================================

Redesign existing tables into a consistent enterprise data-table style.

Support existing functionality:

- Search
- Sorting
- Filtering
- Pagination
- Selection
- Bulk actions
- Row actions
- Loading
- Empty states
- Error states

Do NOT change how these features work.

Improve only:

- visual hierarchy
- spacing
- typography
- borders
- hover states
- status indicators
- action placement
- responsive behavior

Do not remove existing columns or functionality unless the existing application already hides them dynamically.

==================================================
PHASE 7 — FORMS
==================================================

Redesign existing forms without changing their behavior.

Maintain exactly:

- Existing fields
- Existing field names
- Existing validation
- Existing required fields
- Existing default values
- Existing API payloads
- Existing submit behavior
- Existing error handling

Improve:

- grouping
- spacing
- labels
- help text presentation
- section hierarchy
- visual feedback
- responsive layout

For large forms, use logical visual sections or tabs only if this does not change the existing workflow or functionality.

==================================================
PHASE 8 — DETAIL PAGES
==================================================

Use a consistent detail-page pattern.

Example:

← Back

Resource Name
Description

[Edit] [Existing Actions]

--------------------------------

Status
● Active

Owner
User

Created
Date

--------------------------------

Overview
...

Activity
...

Configuration
...

Only display information that already exists.

Do not invent fields or backend data.

==================================================
PHASE 9 — STATUS SYSTEM
==================================================

Use consistent semantic status presentation.

Examples:

Active
Pending
Processing
Completed
Failed
Disabled
Archived

Use the application's existing statuses.

Do not rename statuses.

Do not change status logic.

Only improve visual presentation.

Use semantic styling:

Success → successful/healthy state
Warning → pending/degraded state
Danger → failed/critical state
Info → informational state

==================================================
PHASE 10 — DASHBOARDS
==================================================

Redesign existing dashboards using an enterprise information hierarchy.

Avoid excessive giant cards.

Prefer:

Key metrics
    ↓
Important status
    ↓
Recent activity
    ↓
Tables/charts
    ↓
Detailed information

Use existing data only.

Do not fabricate metrics.

Do not change calculation logic.

==================================================
PHASE 11 — LIGHT AND DARK THEMES
==================================================

Implement a proper semantic light/dark theme system.

Components should use semantic tokens:

--background
--surface
--surface-secondary
--surface-elevated
--text-primary
--text-secondary
--border
--primary

Do not simply invert colors.

Ensure:

- readable text
- proper contrast
- visible borders
- clear focus states
- readable disabled states
- readable status badges
- usable tables
- usable dialogs
- usable forms

==================================================
PHASE 12 — RESPONSIVE DESIGN
==================================================

The UI must work on:

- Desktop
- Laptop
- Tablet
- Mobile

Desktop:
Sidebar + content

Tablet:
Collapsed/compact sidebar where appropriate

Mobile:
Compact navigation and vertically structured content

For tables, use an intentional responsive strategy.

Do not simply create uncontrolled horizontal overflow.

Do not break existing functionality.

==================================================
PHASE 13 — ACCESSIBILITY
==================================================

Improve accessibility while redesigning.

Ensure:

- Keyboard navigation
- Visible focus states
- Appropriate ARIA labels
- Semantic HTML
- Accessible form errors
- Adequate contrast
- Accessible buttons
- Accessible dialogs
- Screen-reader-friendly labels
- Reduced-motion consideration

Do not change functional behavior.

==================================================
PHASE 14 — UX RULES
==================================================

Follow these rules throughout the redesign:

1. Prefer consistency over novelty.
2. Prefer information clarity over decoration.
3. Prefer reusable components over one-off styling.
4. Prefer compact professional layouts over oversized cards.
5. Use whitespace intentionally.
6. Keep primary actions obvious.
7. Keep destructive actions visually distinct.
8. Use consistent status indicators.
9. Keep navigation predictable.
10. Avoid unnecessary animations.
11. Avoid excessive gradients.
12. Avoid decorative UI that does not communicate information.
13. Do not introduce fake data.
14. Do not remove existing functionality.

==================================================
STRICT FUNCTIONALITY PRESERVATION
==================================================

THIS IS CRITICAL.

Before changing any component, determine whether it contains:

- API calls
- validation
- state transitions
- business rules
- authentication
- authorization
- routing
- WebSocket logic
- file handling
- data transformation

If yes, preserve that logic.

Prefer this architecture:

Existing Logic
      ↓
Existing State/API behavior
      ↓
Reusable UI Components
      ↓
New Visual Design

NOT:

New UI
      ↓
Changed logic
      ↓
Changed API
      ↓
Potential regression

Do not refactor backend logic as part of this task.

Do not rename API functions simply for cleaner code.

Do not change request payloads.

Do not change response handling.

Do not change validation schemas.

==================================================
VISUAL QUALITY BAR
==================================================

The finished application should look like a mature enterprise product.

It should NOT look like:

- A generic Bootstrap template
- A generic Tailwind template
- A marketing landing page
- A collection of random dashboard cards
- A Frappe clone
- An AI-generated UI with excessive gradients
- A collection of unrelated component styles

It SHOULD feel:

- Professional
- Calm
- Structured
- Dense but readable
- Consistent
- Fast
- Practical
- Enterprise-grade

==================================================
IMPLEMENTATION STRATEGY
==================================================

Do this incrementally.

Step 1:
Inspect the existing application.

Step 2:
Identify the current design system/components.

Step 3:
Create centralized design tokens.

Step 4:
Redesign the application shell.

Step 5:
Redesign shared components.

Step 6:
Redesign pages using those components.

Step 7:
Verify all existing interactions.

Step 8:
Verify API calls remain unchanged.

Step 9:
Verify validation remains unchanged.

Step 10:
Verify routing remains unchanged.

Step 11:
Verify authentication/authorization remains unchanged.

Step 12:
Test desktop, tablet, mobile, light mode, and dark mode.

==================================================
REGRESSION CHECKLIST
==================================================

Before declaring the work complete, verify:

[ ] All existing routes work
[ ] All existing API endpoints remain unchanged
[ ] HTTP methods remain unchanged
[ ] Request payloads remain unchanged
[ ] Response handling remains unchanged
[ ] Authentication works
[ ] Authorization works
[ ] Validation works
[ ] Forms submit correctly
[ ] File uploads work
[ ] File downloads work
[ ] Search works
[ ] Filters work
[ ] Sorting works
[ ] Pagination works
[ ] Modals work
[ ] Toasts work
[ ] Error states work
[ ] Loading states work
[ ] WebSockets/realtime features work
[ ] Existing permissions work
[ ] Existing business workflows work
[ ] Existing data is displayed correctly
[ ] No fake data was introduced
[ ] No functionality was removed

==================================================
FINAL REQUIREMENT
==================================================

The final result must be a VISUAL/UX REDESIGN of the existing application.

The application should behave exactly as it did before.

Think:

"Same application.
Same APIs.
Same data.
Same validation.
Same business logic.
Same functionality.
Completely improved UI system."

Do not stop after creating a generic component library.

Actually apply the new design system consistently across the existing application.

Before finishing, inspect the resulting screens and fix visual inconsistencies, spacing problems, alignment issues, duplicated styles, inconsistent button hierarchy, inconsistent form layouts, and inconsistent status indicators.

The final UI should look like one coherent product rather than individual pages designed separately.