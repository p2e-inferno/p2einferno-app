# Services Page Implementation Plan

## Goal
Transition the "Services" section from a homepage anchor (`#services`) to a fully featured ecosystem consisting of a main overview page and detailed subpages for each service offering. The content strategy follows a "Hormozi Mode" approach: direct, value-based, and conversion-focused.

## Architecture

### 1. Shared Components
**`components/ui/PageHeader.tsx`**
-   **Purpose**: A reusable top banner for all internal pages to maintain consistency.
-   **Props**: `title`, `description`, `centered` (boolean), `className`.
-   **Design**: Title, subtitle, and optional background pattern.

### 2. Content Management
**`lib/content/services.ts`**
-   **Purpose**: Single source of truth for all text copy. separating content from presentation.
-   **Structure**:
    -   `SERVICES_OVERVIEW`: Data for the main index page (Hero, Why Section, Process, Audience, Proof).
    -   `ALL_SERVICES`: Array of `ServiceContent` objects for the subpages.
    -   `ServiceContent` Type: `slug`, `title`, `subtitle`, `icon`, `ctaPrimary`, `problem`, `solution`, `outcomes`, `deliverables`.

### 3. Pages

#### A. Overview Page (`pages/services/index.tsx`)
-   **Route**: `/services`
-   **Sections**:
    1.  **Hero**: Uses `PageHeader`.
    2.  **Why Section**: Explains the ecosystem problem ("Users don't know what to do next").
    3.  **Services Grid**: Cards linking to individual service pages.
    4.  **Audience & Process**: "Who This Is For" and "The Delivery Process" (4 steps).
    5.  **Proof & CTA**: Outcomes list and final call to action.

#### B. Dynamic Subpages (`pages/services/[slug].tsx`)
-   **Route**: `/services/[slug]` (e.g., `/services/education`, `/services/consulting`)
-   **Functionality**:
    -   Uses `getStaticPaths` to generate routes from `ALL_SERVICES`.
    -   Uses `getStaticProps` to fetch data for the specific service.
-   **Layout**:
    1.  **Navigation**: Breadcrumb back to `/services`.
    2.  **Header**: Service-specific title and subtitle.
    3.  **Primary CTA**: Prominent button.
    4.  **Problem/Solution Split**: Two-column layout contrasting the status quo vs. the solution.
    5.  **Deliverables & Outcomes**: Detailed lists of what the client gets.
    6.  **Final CTA**: Repeated call to action.

### 4. Navigation Updates
-   **Navbar (`components/home/Navbar.tsx`)**: Change `#services` link to `/services`.
-   **Footer (`components/home/Footer.tsx`)**: Change `#services` link to `/services`.

## Implementation Steps

1.  **Create Component**: `components/ui/PageHeader.tsx`
2.  **Create Content**: `lib/content/services.ts` (Populate with provided "Hormozi" copy)
3.  **Create Overview**: `pages/services/index.tsx`
4.  **Create Subpages**: `pages/services/[slug].tsx`
5.  **Update Navigation**: Modify Navbar and Footer links.
6.  **Verify**: Check routes, responsive design, and links.

