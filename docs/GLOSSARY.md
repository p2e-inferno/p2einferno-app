# P2E Inferno - Project Glossary

> **Last Updated**: December 2024  
> **Purpose**: Comprehensive reference of all available modules, components, hooks, utilities, APIs, and configurations in the P2E Inferno project. This document serves as a quick reference for AI/LLM systems and developers to understand what's available without searching the entire codebase.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Frontend Components](#frontend-components)
3. [React Hooks](#react-hooks)
4. [Utility Functions & Libraries](#utility-functions--libraries)
5. [API Endpoints](#api-endpoints)
6. [Pages & Routes](#pages--routes)
7. [Database & Supabase](#database--supabase)
8. [Authentication & Security](#authentication--security)
9. [Blockchain Integration](#blockchain-integration)
10. [Configuration & Constants](#configuration--constants)
11. [Testing & Development](#testing--development)
12. [Documentation](#documentation)

---

## Project Overview

**P2E Inferno** is a comprehensive Play-to-Earn (P2E) gamified education platform for Web3/blockchain learning. Built with Next.js, Privy authentication, Supabase database, and integrated blockchain functionality via Unlock Protocol.

### Key Technologies
- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS
- **Authentication**: Privy (multi-wallet, social login)
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Ethereum/Base, Unlock Protocol, EAS (Ethereum Attestation Service)
- **Payments**: Paystack, Crypto payments
- **UI**: Radix UI, Lucide Icons, Framer Motion

---

## Frontend Components

### User-Facing Components

#### Homepage Components (`components/home/`)
- **`Hero.tsx`** - Main landing page hero section with CTA
- **`Features.tsx`** - Platform features showcase
- **`About.tsx`** - About section with platform description
- **`Services.tsx`** - Services offered by the platform
- **`Bootcamps.tsx`** - Bootcamp programs display
- **`HowItWorks.tsx`** - How the platform works explanation
- **`Navbar.tsx`** - Main navigation component
- **`Footer.tsx`** - Footer component

#### Lobby Components (`components/lobby/`)
- **`connect-wallet-state.tsx`** - Wallet connection state display
- **`current-enrollments.tsx`** - Current user enrollments display
- **`error-state.tsx`** - Error state handling component
- **`loading-state.tsx`** - Loading state component
- **`lobby-background.tsx`** - Lobby background graphics
- **`lobby-navigation.tsx`** - Lobby navigation component
- **`LobbyConfirmationModal.tsx`** - Lobby confirmation modal
- **`MilestoneProgressRing.tsx`** - Milestone progress visualization
- **`MilestoneTaskClaimButton.tsx`** - Milestone task claim button
- **`MilestoneTimer.tsx`** - Milestone countdown timer
- **`NotificationBell.tsx`** - Notification bell component
- **`pending-applications-alert.tsx`** - Pending applications alert
- **`quick-actions-grid.tsx`** - Quick actions grid layout
- **`stats-grid.tsx`** - Statistics grid display
- **`TaskSubmissionModal.tsx`** - Task submission modal
- **`welcome-section.tsx`** - Welcome section component
- **`pages/`** - Lobby-specific page components
  - `achievements-page.tsx` - Achievements page
  - `bounties-page.tsx` - Bounties listing
  - `events-page.tsx` - Events management

#### Application Components (`components/apply/`)
- **`bootcamp-card.tsx`** - Individual bootcamp display card
- **`cohort-hero.tsx`** - Cohort information header
- **`coming-soon-section.tsx`** - Coming soon placeholder
- **`index.ts`** - Application components exports
- **`types.ts`** - Application component types
- **`steps/`** - Application form steps
  - `PersonalInfoStep.tsx` - Personal information step
  - `ExperienceStep.tsx` - Experience level step
  - `MotivationStep.tsx` - Motivation and goals step
  - `ReviewStep.tsx` - Application review step

#### Bootcamp Components (`components/bootcamps/`)
- **`BootcampCard.tsx`** - Bootcamp program card
- **`BootcampCohortCard.tsx`** - Cohort-specific card
- **`BootcampsComingSoon.tsx`** - Coming soon display
- **`index.ts`** - Bootcamp components exports

#### Profile Components (`components/profile/`)
- **`account-card.tsx`** - User account information card
- **`completion-call-to-action.tsx`** - Profile completion CTA
- **`linked-accounts-section.tsx`** - Linked accounts display
- **`profile-header.tsx`** - Profile header component
- **`index.ts`** - Profile components exports
- **`types.ts`** - Profile component types

#### Quest Components (`components/quests/`)
- **`quest-card.tsx`** - Individual quest display card
- **`quest-list.tsx`** - Quest listing component
- **`QuestHeader.tsx`** - Quest header component
- **`TaskItem.tsx`** - Individual task item component
- **`index.ts`** - Quest components exports
- **`types.ts`** - Quest component types

#### Check-in Components (`components/checkin/`)
- **`CheckinCard.tsx`** - Daily check-in interface
- **`DailyCheckinButton.tsx`** - Check-in action button
- **`StreakDisplay.tsx`** - Streak information display
- **`index.tsx`** - Check-in components exports

#### Attestation Components (`components/attestation/`)
- **`AttestationButton.tsx`** - Attestation creation button
- **`AttestationCard.tsx`** - Attestation display card
- **`AttestationList.tsx`** - List of attestations
- **`index.ts`** - Attestation components exports
- **`ui/`** - Attestation-specific UI components
  - `AttestationBadge.tsx` - Attestation status badge
  - `AttestationStatus.tsx` - Attestation status display

#### Payment Components (`components/payment/`)
- **`BlockchainPayment.tsx`** - Blockchain payment interface
- **`currency-selector.tsx`** - Currency selection component
- **`discount-code-input.tsx`** - Discount code input field
- **`order-summary.tsx`** - Order summary display
- **`payment-method-selector.tsx`** - Payment method selection
- **`PaymentSummary.tsx`** - Payment summary component
- **`PaystackPayment.tsx`** - Paystack payment integration
- **`index.ts`** - Payment components exports
- **`types.ts`** - Payment component types

#### Unlock Components (`components/unlock/`)
- **`UnlockPurchaseButton.tsx`** - Unlock key purchase button
- **`UnlockUtilsDemo.tsx`** - Unlock utilities demonstration

#### Dashboard Components (`components/dashboard/`)
- **`bottom-dock.tsx`** - Bottom dock navigation component

#### Cohort Components (`components/cohort/`)
- **`weekly-content-card.tsx`** - Weekly content display card
- **`types.ts`** - Cohort component types

### Admin Components (`components/admin/`)

#### Admin Dashboard & Layout
- **`AdminDashboard.tsx`** - Main admin dashboard with module navigation
- **`AdminSessionGate.tsx`** - Admin session protection component
- **`AdminAccessRequired.tsx`** - Admin access requirement component
- **`AdminSessionRequired.tsx`** - Admin session requirement component
- **`AdminEditPageLayout.tsx`** - Admin edit page layout wrapper
- **`AdminListPageLayout.tsx`** - Admin list page layout wrapper
- **`AdminNavigation.tsx`** - Admin navigation component
- **`AdminResponsiveTable.tsx`** - Responsive table component for admin

#### Admin Forms & Management
- **`BootcampForm.tsx`** - Bootcamp creation/editing form
- **`CohortForm.tsx`** - Cohort creation/editing form
- **`MilestoneForm.tsx`** - Milestone creation/editing form
- **`MilestoneFormEnhanced.tsx`** - Enhanced milestone form with advanced features
- **`QuestForm.tsx`** - Quest creation/editing form
- **`QuestTaskForm.tsx`** - Quest task creation/editing form
- **`ProgramHighlightsForm.tsx`** - Program highlights form
- **`ProgramRequirementsForm.tsx`** - Program requirements form

#### Admin Data Display & Tables
- **`CohortsTable.tsx`** - Cohorts data table
- **`MilestoneList.tsx`** - Milestone list component
- **`TaskList.tsx`** - Task list component
- **`TaskSubmissions.tsx`** - Task submissions management
- **`QuestSubmissionsTable.tsx`** - Quest submissions table
- **`SubmissionReviewModal.tsx`** - Submission review modal
- **`KeyGrantReconciliation.tsx`** - Key grant reconciliation component

#### Admin Utilities
- **`withAdminAuth.tsx`** - Higher-order component for admin authentication
- **`withAdminFormErrorHandling.tsx`** - HOC for admin form error handling

### UI Components (`components/ui/`)
- **`auth-error.tsx`** - Authentication error display component
- **`badge.tsx`** - Badge/label components
- **`button.tsx`** - Button component with variants
- **`card.tsx`** - Card layout components
- **`carousel.tsx`** - Carousel/slider component
- **`confirmation-dialog.tsx`** - Confirmation dialog component
- **`dialog.tsx`** - Dialog/modal components
- **`image-upload.tsx`** - Image upload component
- **`input.tsx`** - Input field components
- **`label.tsx`** - Label components
- **`loading-button.tsx`** - Loading state button component
- **`loading-overlay.tsx`** - Loading overlay component
- **`network-error.tsx`** - Network error display component
- **`notification-center.tsx`** - Notification center component
- **`progress-steps.tsx`** - Progress steps indicator
- **`progress.tsx`** - Progress bar components
- **`select.tsx`** - Select dropdown components
- **`separator.tsx`** - Visual separator component
- **`SuccessScreen.tsx`** - Success screen component
- **`tabs.tsx`** - Tab navigation components
- **`textarea.tsx`** - Textarea components

### Context Providers (`contexts/`)

#### Admin Authentication Context (`contexts/admin-context/`)
- **`AdminAuthProvider.tsx`** - Main provider component for centralized admin authentication state management
- **`index.ts`** - Clean public API with all exports
- **`types/AdminAuthContextTypes.ts`** - Type definitions for auth status and context value
- **`constants/AdminAuthContextConstants.ts`** - Configuration constants (cache duration, retry delays)
- **`utils/adminAuthContextStatusUtils.ts`** - Status derivation utilities
- **`utils/adminAuthContextCacheUtils.ts`** - Cache management utilities
- **`hooks/useAdminAuthContextInternal.ts`** - Main composition hook
- **`hooks/useAdminAuthContextActions.ts`** - Action methods management
- **`hooks/useAdminAuthContextState.ts`** - Internal state management

**Main Hook**: `useAdminAuthContext()` - Type-safe context consumption with error boundaries

**Utilities**: 
- `isFullyAuthenticated()` - Check if auth status indicates full authentication
- `isAuthLoading()` - Check if auth status indicates loading state  
- `getAuthStatusMessage()` - Get user-friendly message for auth status
- `deriveAuthStatus()` - Derive unified auth status from multiple states
- `isCacheValid()` - Check if auth cache is still valid
- `createCacheExpiry()` - Create cache expiry timestamp

**Constants**:
- `AUTH_CACHE_DURATION` - Cache duration for authentication checks (default: 2 minutes)
- `ERROR_RETRY_DELAY` - Delay between error retry attempts (default: 5 seconds)
- `MAX_ERROR_COUNT` - Maximum consecutive errors before system unhealthy
- `MAX_BACKOFF_DELAY` - Maximum backoff delay for exponential backoff

### Layout Components (`components/layouts/`)
- **`MainLayout.tsx`** - Main application layout
- **`AdminLayout.tsx`** - Admin-specific layout
- **`lobby-layout.tsx`** - Lobby page layout

### Shared Components (Root Level)
- **`ClientSideWrapper.tsx`** - Client-side rendering wrapper
- **`CustomDropdown.tsx`** - Custom dropdown component with menu items
- **`formatted-date.tsx`** - Date formatting component
- **`logo.tsx`** - Application logo component
- **`PrivyConnectButton.tsx`** - Privy authentication button with wallet management
- **`WalletCard.tsx`** - Individual wallet display card
- **`WalletDetailsModal.tsx`** - Detailed wallet information modal
- **`WalletList.tsx`** - List of user wallets component
- **`layout.tsx`** - Main layout wrapper component

### Graphics & Icons
- **`graphics/`** - Custom graphics and illustrations
  - `login.tsx` - Login page graphics
  - `portal.tsx` - Portal page graphics
- **`icons/`** - Icon components
  - `dashboard-icons.tsx` - Dashboard-specific icons

---

## React Hooks

### Authentication & Admin Hooks
- **`useAdminApi.ts`** - Admin API calls with session management and auto-refresh
- **`useAdminAuthWithSession.ts`** - Admin authentication with session handling
- **`useAdminFetchOnce.ts`** - One-time admin data fetching with caching and TTL
- **`useAdminSession.ts`** - Admin session management and validation
- **`useLockManagerAdminAuth.ts`** - Lock manager admin authentication with wallet validation
- **`useVerifyToken.ts`** - Token verification hook for authentication

### Admin Context Hooks (`contexts/admin-context/hooks/`)
- **`useAdminAuthContextInternal.ts`** - Main composition hook combining all AdminAuthContext functionality
- **`useAdminAuthContextActions.ts`** - Action methods management (refresh, session creation, error handling)
- **`useAdminAuthContextState.ts`** - Internal state management with error tracking and caching

### User & Profile Hooks
- **`useUserEnrollments.ts`** - User enrollment data management and tracking
- **`useDashboardData.ts`** - Dashboard data aggregation and caching
- **`useDetectConnectedWalletAddress.ts`** - Connected wallet address detection
- **`useENSResolution.ts`** - ENS name resolution and reverse lookup
- **`useSmartWalletSelection.ts`** - Smart wallet selection logic and management
- **`useWalletBalances.ts`** - Wallet balance tracking with polling and gating
- **`useWalletManagement.ts`** - Wallet management operations and state

### Bootcamp & Application Hooks
- **`useBootcamps.ts`** - Bootcamp data fetching and management
- **`useBootcampPayment.ts`** - Bootcamp payment processing and verification
- **`useCohortDetails.ts`** - Cohort information management and enrollment status
- **`usePayment.ts`** - General payment processing and status tracking
- **`useMilestoneClaim.ts`** - Milestone claim processing and validation

### Quest & Activity Hooks
- **`useQuests.ts`** - Quest data and progress management with task tracking
- **`useNotifications.ts`** - Notification system management and real-time updates

### Check-in Hooks (`hooks/checkin/`)
- **`useDailyCheckin.ts`** - Daily check-in functionality with status management
- **`useStreakData.ts`** - Streak tracking and tier progression data
- **`useCheckinWithStreak.ts`** - Combined check-in and streak hook with convenience methods
- **`useStreakDisplay.ts`** - Streak display utilities and formatting
- **`useCheckinEligibility.ts`** - Check-in eligibility checking without full state management

### Attestation Hooks (`hooks/attestation/`)
- **`useAttestations.ts`** - Attestation data management and creation
- **`useAttestationSchemas.ts`** - Attestation schema management and validation
- **`useAttestationQueries.ts`** - Attestation query operations and statistics
  - `useUserAttestations` - User-specific attestations
  - `useSchemaAttestations` - Schema-specific attestations
  - `useUserAttestationStats` - User attestation statistics
  - `useSchemaStats` - Schema usage statistics

### Utility Hooks
- **`useApiCall.ts`** - Generic API call management with error handling
- **`useRetryable.ts`** - Retryable operation management with exponential backoff
- **`useScrollbarFix.ts`** - Scrollbar styling fixes for cross-browser compatibility
- **`useMessageSigning.ts`** - Message signing operations for blockchain interactions
- **`useTOSSigning.ts`** - Terms of service signing and verification

---

## Utility Functions & Libraries

### Root-Level Libraries (`lib/`)
- **`api.ts`** - Axios-based API client with interceptors and error handling
- **`bootcamp-data.ts`** - Static bootcamp program and cohort data
- **`dateUtils.ts`** - Date manipulation and formatting utilities
- **`payment-helpers.ts`** - Payment processing helpers and validation
- **`payment-utils.ts`** - Payment utility functions and calculations
- **`privyUtils.ts`** - Privy authentication utility functions
- **`supabase.ts`** - Supabase client exports
- **`utils.ts`** - General utility functions (cn, wallet listeners)

### Core Utilities (`lib/utils/`)
- **`error-utils.ts`** - Error handling and normalization utilities
- **`id-generation.ts`** - ID generation utilities
- **`lock-deployment-state.ts`** - Lock deployment state management
- **`milestone-utils.ts`** - Milestone-related utility functions
- **`registration-validation.ts`** - Registration validation utilities
- **`wallet-address.ts`** - Wallet address formatting and validation
- **`logger/`** - Comprehensive logging system
  - `core.ts` - Core logging functionality and interface
  - `formatting.ts` - Log formatting utilities
  - `index.ts` - Logger exports and configuration
  - `levels.ts` - Log level definitions and management
  - `sanitize.ts` - Log sanitization utilities
  - `transport.ts` - Log transport mechanisms

### Admin Context Utilities (`contexts/admin-context/utils/`)
- **`adminAuthContextStatusUtils.ts`** - Status derivation and validation utilities
  - `deriveAuthStatus()` - Derive unified auth status from multiple auth states
  - `isFullyAuthenticated()` - Type guard for full authentication
  - `isAuthLoading()` - Type guard for loading state
  - `getAuthStatusMessage()` - User-friendly status messages
- **`adminAuthContextCacheUtils.ts`** - Cache management and validation utilities
  - `isCacheValid()` - Check cache validity
  - `createCacheExpiry()` - Create cache expiry timestamps
  - `shouldInvalidateCache()` - Determine cache invalidation logic

### Authentication Utilities (`lib/auth/`)
- **`admin-auth.ts`** - Admin authentication middleware and validation
- **`admin-key-checker.ts`** - Admin key checking and validation
- **`admin-session.ts`** - Admin session management and JWT handling
- **`config-validation.ts`** - Configuration validation utilities
- **`error-handler.ts`** - Authentication error handling and responses
- **`ownership.ts`** - Ownership validation utilities
- **`privy.ts`** - Privy authentication helpers and user management
- **`hooks/`** - Authentication hooks
  - `useAuth.ts` - Authentication state management hook
- **`route-handlers/`** - Route handler utilities
  - `admin-guard.ts` - Admin route protection middleware

### Blockchain Utilities (`lib/blockchain/`)
- **`admin-lock-config.ts`** - Admin lock configuration management
- **`client-config.ts`** - Client-side blockchain configuration
- **`config.ts`** - General blockchain configuration
- **`frontend-config.ts`** - Frontend-specific blockchain configuration
- **`grant-key-service.ts`** - Key granting service implementation
- **`index.ts`** - Blockchain utilities exports
- **`lock-manager.ts`** - Lock management utilities
- **`provider.ts`** - Blockchain provider management and configuration
- **`server-config.ts`** - Server-side blockchain configuration
- **`transaction-helpers.ts`** - Transaction helper utilities
- **`config/`** - Blockchain configuration
  - `unified-config.ts` - Unified blockchain configuration management
- **`shared/`** - Shared blockchain utilities
  - `abi-definitions.ts` - ABI definitions and constants
  - `client-utils.ts` - Client-side blockchain utilities
  - `error-utils.ts` - Blockchain error handling utilities
  - `logger-bridge.ts` - Logger bridge for blockchain operations
  - `logging-utils.ts` - Blockchain-specific logging utilities
  - `network-utils.ts` - Network utility functions
  - `transaction-utils.ts` - Transaction utility functions

### Unlock Protocol (`lib/unlock/`)
- **`lockUtils.ts`** - Comprehensive Unlock protocol utilities
  - Read operations: `getTotalKeys`, `checkKeyOwnership`, `getUserKeyBalance`, `getKeyPrice`, `getIsLockManager`
  - Wallet operations: `purchaseKey`
  - Advanced management: `deployLock`, `grantKeys`, `addLockManager`
  - Utilities: `getBlockExplorerUrl`

### Attestation System (`lib/attestation/`)
- **`index.ts`** - Main attestation system exports
- **`core/`** - Core attestation functionality
  - `config.ts` - Attestation configuration
  - `index.ts` - Core exports
  - `service.ts` - Attestation service implementation
  - `types.ts` - Core attestation types
- **`database/`** - Database operations
  - `index.ts` - Database exports
  - `queries.ts` - Database query utilities
- **`schemas/`** - Schema management
  - `definitions.ts` - Schema definitions
  - `index.ts` - Schema exports
  - `registry.ts` - Schema registry management
- **`utils/`** - Attestation utilities
  - `encoder.ts` - Data encoding utilities
  - `helpers.ts` - General attestation helpers
  - `index.ts` - Utility exports
  - `validator.ts` - Data validation utilities

### Check-in System (`lib/checkin/`)
- **`index.ts`** - Check-in system exports
- **`core/`** - Core check-in functionality
  - `schemas.ts` - Check-in schemas and validation
  - `service.ts` - Check-in service implementation
  - `types.ts` - Check-in type definitions
- **`streak/`** - Streak management
  - `calculator.ts` - Streak calculation utilities
  - `multiplier.ts` - Streak multiplier calculations
- **`xp/`** - Experience point management
  - `calculator.ts` - XP calculation utilities
  - `updater.ts` - XP update and management

### Supabase Utilities (`lib/supabase/`)
- **`client.ts`** - Supabase client configuration
- **`current-schema-check.ts`** - Current schema validation
- **`index.ts`** - Supabase utilities exports
- **`server.ts`** - Server-side Supabase client
- **`types-gen-repaired.ts`** - Repaired generated types
- **`types-gen.ts`** - Generated type definitions
- **`types.ts`** - Application type definitions

### Services (`lib/services/`)
- **`enrollment-service.ts`** - User enrollment service management
- **`status-sync-service.ts`** - Status synchronization service
- **`user-key-service.ts`** - User key management service

### API Utilities (`lib/api/`)
- **`parsers/`** - API response parsers
  - `admin-task-details.ts` - Admin task details parser

### Configuration (`lib/config/`)
- **`admin.ts`** - Admin configuration management

### Types (`lib/types/`)
- **`application-status.ts`** - Application status type definitions

---

## API Endpoints

### Pages API (`pages/api/`)

#### User Endpoints
- **`user/profile.ts`** - User profile management (GET, POST, PUT)
- **`user/profile-simple.ts`** - Simplified profile operations
- **`user/wallet-addresses.ts`** - User wallet address management
- **`user/applications/reconcile.ts`** - Application reconciliation
- **`user/notifications.ts`** - User notification management

#### Application Endpoints
- **`applications.ts`** - Application submission (POST)
- **`applications/[id].ts`** - Individual application management (GET, DELETE)

#### Bootcamp Endpoints
- **`bootcamps.ts`** - Bootcamp listing (GET)

#### Quest Endpoints
- **`quests/index.ts`** - Quest management
- **`quests/user-progress.ts`** - User quest progress tracking

#### Payment Endpoints
- **`payment/initialize.ts`** - Payment initialization
- **`payment/verify.ts`** - Payment verification
- **`payment/webhook.ts`** - Payment webhook handling

#### Admin Endpoints
- **`admin/quests/index.ts`** - Admin quest management
- **`admin/reconcile-key-grants.ts`** - Key grant reconciliation
- **`admin/images.ts`** - Image upload management

#### System Endpoints
- **`health.ts`** - Health check endpoint

### App API (`app/api/`)

#### Admin Route Handlers (`app/api/admin/`)

##### Session Management
- **`session/route.ts`** - Admin session creation and management (POST)
- **`session/verify/route.ts`** - Admin session verification (GET)
- **`logout/route.ts`** - Admin session logout and cleanup

##### Bootcamp Management
- **`bootcamps/route.ts`** - Bootcamp CRUD operations (GET, POST, PUT, DELETE)
- **`bootcamps/[id]/route.ts`** - Individual bootcamp management (GET, PUT, DELETE)

##### Cohort Management
- **`cohorts/route.ts`** - Cohort CRUD operations (GET, POST, PUT, DELETE)
- **`cohorts/[cohortId]/route.ts`** - Individual cohort management (GET, PUT, DELETE)
- **`cohorts/[cohortId]/applications/route.ts`** - Cohort applications management (GET, POST)

##### Task & Milestone Management
- **`tasks/details/route.ts`** - Task details with bundled data (GET)
- **`tasks/by-milestone/route.ts`** - Tasks by milestone (GET)
- **`milestones/route.ts`** - Milestone CRUD operations (GET, POST, PUT, DELETE)
- **`milestone-tasks/route.ts`** - Milestone task mutations (POST, PUT, DELETE)
- **`task-submissions/route.ts`** - Task submission management (GET, POST, PUT)

---

## Pages & Routes

### Next.js App Configuration
- **`_app.tsx`** - Next.js app configuration with Privy provider and global styles
- **`_document.tsx`** - Next.js document configuration for HTML structure

### Public Pages
- **`index.tsx`** - Homepage with hero, features, services, and bootcamp listings
- **`portal.tsx`** - Portal page with navigation and gateway interface
- **`dashboardx.tsx`** - Legacy user dashboard with Privy authentication demo

### Application Pages (`pages/apply/`)
- **`index.tsx`** - Bootcamp listing and application selection
- **`[cohortId].tsx`** - Specific cohort application form

### Bootcamp Pages (`pages/bootcamp/`)
- **`[id].tsx`** - Individual bootcamp details and information
- **`[id]/cohort/[cohortId].tsx`** - Cohort-specific bootcamp page

### Payment Pages (`pages/payment/`)
- **`[applicationId].tsx`** - Payment processing page for applications

### Lobby Pages (`pages/lobby/`)
- **`index.tsx`** - Main lobby interface with dashboard
- **`achievements/index.tsx`** - User achievements and progress
- **`apply/index.tsx`** - Application management from lobby
- **`bootcamps/[cohortId].tsx`** - Bootcamp details from lobby
- **`bootcamps/enrolled.tsx`** - Enrolled bootcamps view
- **`bounties/index.tsx`** - Bounties and rewards page
- **`events/index.tsx`** - Events and activities page
- **`profile/index.tsx`** - User profile management
- **`quests/index.tsx`** - Quest listing and management
- **`quests/[id].tsx`** - Individual quest details and progress
- **`unlock-demo.tsx`** - Unlock protocol demonstration

### Admin Pages (`pages/admin/`)

#### Admin Dashboard & Management
- **`index.tsx`** - Main admin dashboard with module navigation
- **`blockchain.tsx`** - Blockchain tools and management
- **`draft-recovery.tsx`** - Draft recovery and data restoration
- **`unlock-demo.tsx`** - Unlock protocol demonstration for admins

#### Bootcamp Management
- **`bootcamps/index.tsx`** - Bootcamp listing and management
- **`bootcamps/new.tsx`** - Create new bootcamp program
- **`bootcamps/[id].tsx`** - Individual bootcamp admin and editing

#### Cohort Management
- **`cohorts/index.tsx`** - Cohort listing and management
- **`cohorts/new.tsx`** - Create new cohort
- **`cohorts/[cohortId]/index.tsx`** - Individual cohort admin
- **`cohorts/[cohortId]/applications.tsx`** - Cohort applications management
- **`cohorts/[cohortId]/milestones.tsx`** - Cohort milestones management
- **`cohorts/[cohortId]/milestones/[milestoneId].tsx`** - Individual milestone admin
- **`cohorts/[cohortId]/program-details.tsx`** - Program details management
- **`cohorts/[cohortId]/tasks/[id]/submissions.tsx`** - Task submissions management

#### Application Management
- **`applications/index.tsx`** - Application listing and management

#### Quest Management
- **`quests/index.tsx`** - Quest listing and management
- **`quests/new.tsx`** - Create new quest
- **`quests/[id].tsx`** - Individual quest admin
- **`quests/[id]/edit.tsx`** - Quest editing interface

#### Payment Management
- **`payments/index.tsx`** - Payment transactions management

### API Routes (`pages/api/`)

#### Admin API Routes (`pages/api/admin/`)
- **`applications/index.ts`** - Admin application management
- **`applications/reconcile.ts`** - Application reconciliation
- **`check-blockchain-admin-status.ts`** - Blockchain admin status check
- **`debug.ts`** - Admin debugging utilities
- **`grant-key.ts`** - Key granting operations
- **`images.ts`** - Image upload and management
- **`payments/index.ts`** - Payment management
- **`program-highlights.ts`** - Program highlights management
- **`program-requirements.ts`** - Program requirements management
- **`quests/index.ts`** - Quest management
- **`quests/[id].ts`** - Individual quest operations
- **`quests/submissions.ts`** - Quest submissions management
- **`reconcile-key-grants.ts`** - Key grant reconciliation
- **`recover-lock-deployment.ts`** - Lock deployment recovery
- **`server-wallet.ts`** - Server wallet management
- **`session-fallback.ts`** - Admin session fallback

#### Application API Routes
- **`applications.ts`** - Application submission and management
- **`applications/[id].ts`** - Individual application operations

#### Bootcamp API Routes
- **`bootcamps.ts`** - Bootcamp listing and data
- **`bootcamps/[id].ts`** - Individual bootcamp operations

#### Cohort API Routes
- **`cohorts/[cohortId].ts`** - Cohort operations and management

#### Payment API Routes (`pages/api/payment/`)
- **`initialize.ts`** - Payment initialization
- **`verify/[reference].ts`** - Payment verification
- **`webhook.ts`** - Payment webhook handling
- **`blockchain/initialize.ts`** - Blockchain payment initialization
- **`blockchain/verify.ts`** - Blockchain payment verification
- **`blockchain/status/[reference].ts`** - Blockchain payment status

#### Quest API Routes (`pages/api/quests/`)
- **`index.ts`** - Quest listing and management
- **`[id].ts`** - Individual quest operations
- **`[id]/start.ts`** - Quest start operations
- **`check-tos.ts`** - Terms of service checking
- **`claim-rewards.ts`** - Quest reward claiming
- **`claim-task-reward.ts`** - Task reward claiming
- **`complete-task.ts`** - Task completion
- **`sign-tos.ts`** - Terms of service signing
- **`user-progress.ts`** - User quest progress tracking

#### User API Routes (`pages/api/user/`)
- **`profile.ts`** - User profile management
- **`profile-simple.ts`** - Simplified profile operations
- **`wallet-addresses.ts`** - Wallet address management
- **`notifications.ts`** - User notifications
- **`enrollments.ts`** - User enrollments
- **`applications/reconcile.ts`** - Application reconciliation
- **`cohort/[cohortId]/milestones.ts`** - User cohort milestones
- **`enrollment/[enrollmentId]/remove.ts`** - Enrollment removal
- **`task/[taskId]/claim.ts`** - Task reward claiming
- **`task/[taskId]/submit.ts`** - Task submission
- **`task/[taskId]/upload.ts`** - Task file upload

#### System API Routes
- **`health.ts`** - Health check endpoint
- **`verify.ts`** - General verification endpoint
- **`milestones/claim.ts`** - Milestone claiming
- **`unlock/webhook.ts`** - Unlock protocol webhook
- **`security/csp-report.ts`** - Content Security Policy reporting

#### Blockchain API Routes
- **`ethereum/personal_sign.ts`** - Ethereum message signing
- **`solana/sign_message.ts`** - Solana message signing

#### Debug API Routes (`pages/api/debug/`)
- **`admin-auth-user.ts`** - Admin authentication debugging
- **`user-profile.ts`** - User profile debugging

---

## Database & Supabase

### Supabase Configuration (`supabase/`)
- **`config.toml`** - Supabase project configuration with API, database, realtime, and studio settings
- **`package.json`** - Supabase utilities package with migration scripts
- **`run_migrations.js`** - Migration runner script with environment validation and error handling

### Database Schema
- **`user_profiles`** - User profile information and metadata
- **`applications`** - Bootcamp applications with payment tracking
- **`user_application_status`** - Application status tracking and reconciliation
- **`bootcamp_programs`** - Bootcamp program definitions with images and rewards
- **`cohorts`** - Bootcamp cohorts with participant tracking
- **`bootcamp_enrollments`** - User enrollments and enrollment status
- **`quests`** - Quest definitions with images and task relationships
- **`quest_tasks`** - Individual quest tasks with verification methods
- **`user_quest_progress`** - User quest progress and completion tracking
- **`user_task_completions`** - Task completion tracking and rewards
- **`user_activities`** - User activity logging and audit trail
- **`milestones`** - Learning milestones with progress tracking
- **`milestone_tasks`** - Milestone-specific tasks with contract interactions
- **`task_submissions`** - Task submissions with file uploads and reviews
- **`notifications`** - User notifications with delivery tracking
- **`attestations`** - On-chain attestations with EAS integration
- **`attestation_schemas`** - Attestation schemas with category management
- **`payment_transactions`** - Payment transaction records with blockchain data
- **`lock_registry`** - Unlock protocol lock registry and management
- **`user_milestone_progress`** - User milestone progress tracking
- **`user_task_progress`** - User task progress and completion status
- **`user_journey_preferences`** - User journey and preference settings

### Database Functions
- **`handle_successful_payment()`** - Atomic payment processing with enrollment creation
- **`is_admin()`** - Admin role checking and validation
- **`exec_sql()`** - Admin SQL execution with security controls
- **`create_or_update_user_profile()`** - User profile management and creation
- **`get_user_dashboard_data()`** - Dashboard data aggregation and caching
- **`notify_task_review_outcome()`** - Task review notification system
- **`update_cohort_participant_counts()`** - Cohort participant count management
- **`sync_storage_policies()`** - Storage policy synchronization

### Edge Functions (`supabase/functions/`)
- **`verify-blockchain-payment/`** - Blockchain payment verification system
  - `index.ts` - Main function logic with RPC fallbacks and error handling
  - `supabase.toml` - Function configuration and environment settings
  - `tsconfig.json` - TypeScript configuration for Edge Functions

### Migrations (`supabase/migrations/`)
- **62 migration files** - Complete database schema evolution
- **Key Migration Categories:**

#### **Core Schema Setup (000-010)**
- `000_setup_functions.sql` - Admin functions and security setup
- `001_initial_schema.sql` - Initial database schema with quests and applications
- `002_sample_data.sql` - Sample data for development and testing
- `003_user_profiles_schema.sql` - User profile schema and relationships
- `004_unlock_integration.sql` - Unlock protocol integration
- `005_lock_registry.sql` - Lock registry and management
- `006_bootcamp_updates.sql` - Bootcamp system updates
- `007_fix_lock_registry_rls.sql` - Row Level Security fixes
- `008_fix_cohort_milestones_rls.sql` - Cohort milestone security
- `009_admin_functions.sql` - Admin function definitions
- `010_bootcamp_updates.sql` - Additional bootcamp enhancements

#### **Quest System (011-022)**
- `011_cohort_managers.sql` - Cohort management system
- `012_fix_rls_policies for lock_registry table.sql` - Security policy fixes
- `013_quest_system.sql` - Complete quest system implementation
- `014_remove_registration_dates_add_cohort_fields.sql` - Cohort field updates
- `015_fix_cohort_validation_function.sql` - Validation function fixes
- `016_fix_cohorts_rls_policies.sql` - Cohort security policies
- `017_remove_bootcamp_cost_fields.sql` - Cost field cleanup
- `018_add_bootcamp_image.sql` - Bootcamp image support
- `019_quest_input_and_review_system.sql` - Quest review system
- `020_fix_user_task_completions_relationship.sql` - Task completion fixes
- `021_add_quest_images_bucket.sql` - Quest image storage
- `022_allow_anon_quest_images.sql` - Anonymous quest image access

#### **Payment System (023-035)**
- `023_add_blockchain_payment_fields.sql` - Blockchain payment support
- `024_fix_application_status_sync.sql` - Application status synchronization
- `025_status_sync_triggers.sql` - Status sync trigger system
- `026_enhanced_user_applications_view.sql` - Enhanced application views
- `027_payment_transactions.sql` - Payment transaction system
- `028_atomic_payment_handling.sql` - Atomic payment processing
- `029_add_user_profile_id_to_applications.sql` - Application profile linking
- `030_fix_payment_function_direct.sql` - Payment function fixes
- `031_fix_payment_method_constraint.sql` - Payment method constraints
- `032_fix_ambiguous_column.sql` - Column ambiguity fixes
- `033_fix_ambiguous_column_v2.sql` - Additional column fixes
- `034_fix_ambiguous_final.sql` - Final column ambiguity resolution
- `035_debug_payment_function.sql` - Payment function debugging

#### **Milestone System (037-047)**
- `037_milestone_tasks_and_submissions.sql` - Milestone task system
- `038_fix_ambiguous_column_references.sql` - Column reference fixes
- `039_fix_xp_update_in_user_profiles.sql` - XP update system
- `040_add_paystack_reference_column.sql` - Paystack integration
- `041_add_task_types_to_milestone_tasks.sql` - Task type system
- `042_enhance_task_submissions_table.sql` - Task submission enhancements
- `043_create_user_milestone_progress_table.sql` - Milestone progress tracking
- `044_create_user_task_progress_table.sql` - Task progress tracking
- `045_add_milestone_progress_triggers.sql` - Progress trigger system
- `047_add_contract_interaction_fields_to_milestone_tasks.sql` - Contract interactions

#### **Notification System (048-052)**
- `048_create_notifications_table.sql` - Notification system
- `049_ensure_blockchain_fields_on_payment_transactions.sql` - Blockchain payment fields
- `050_create_user_journey_preferences.sql` - User journey preferences
- `051_create_task_submissions_bucket.sql` - Task submission storage
- `052_notify_task_review_outcome.sql` - Task review notifications

#### **System Maintenance (053-062)**
- `053_cleanup_duplicate_submissions.sql` - Data cleanup
- `054_remote_schema.sql` - Remote schema synchronization
- `055_revert_text_ids_to_uuid.sql` - ID type standardization
- `056_standardize_milestone_ids_to_uuid.sql` - Milestone ID standardization
- `057_sync_storage_policies.sql` - Storage policy synchronization
- `058_repair_contract_interaction_schema.sql` - Contract interaction repairs
- `059_update_cohort_participant_counts.sql` - Participant count management
- `060_fix_participant_count_active_status.sql` - Active status fixes
- `061_complete_notification_system.sql` - Complete notification system
- `062_attestation_system.sql` - Ethereum Attestation Service integration

---

## Authentication & Security

### Privy Integration
- **Multi-wallet support** - Ethereum, social logins
- **Session management** - JWT-based authentication
- **User management** - Profile linking and management

### Admin Authentication
- **Two-tier system** - Session-based + blockchain verification
- **Admin session** - Short-lived JWT cookies
- **Blockchain verification** - On-chain admin key checking
- **Session hijacking protection** - Wallet-session validation

### Security Features
- **CSP implementation** - Content Security Policy
- **Environment validation** - Configuration validation
- **Error handling** - Structured error responses
- **Rate limiting** - API rate limiting
- **Input validation** - Request validation

---

## Blockchain Integration

### Unlock Protocol
- **Lock management** - Deploy and manage locks
- **Key operations** - Purchase, grant, and manage keys
- **Payment verification** - On-chain payment verification
- **Admin functions** - Lock manager operations

### Ethereum Attestation Service (EAS)
- **Attestation creation** - On-chain attestation creation
- **Schema management** - Attestation schema handling
- **Verification** - Attestation verification
- **Integration** - Seamless EAS integration

### Blockchain Clients
- **Ethers.js** - Primary blockchain client
- **Viem** - Alternative blockchain client
- **Provider management** - Unified provider system
- **Network support** - Base, Ethereum mainnet

---

## Configuration & Constants

### Constants (`constants/`)
- **`index.ts`** - Main constants export with PUBLIC_LOCK_CONTRACT configuration
- **`public_lock_abi.ts`** - Complete Unlock Protocol Public Lock ABI with all contract functions
  - **Read Functions**: `balanceOf`, `getHasValidKey`, `getRoleAdmin`, `getTransferFee`, `tokenOfOwnerByIndex`, `keyExpirationTimestampFor`, `totalSupply`, `keyPrice`
  - **Write Functions**: `grantKeys`, `purchase`, `safeTransferFrom`
  - **Admin Functions**: Role management and key granting capabilities
  - **ERC-721 Functions**: NFT standard compliance for key management

### Admin Context Constants (`contexts/admin-context/constants/`)
- **`AdminAuthContextConstants.ts`** - Admin authentication context configuration
  - `AUTH_CACHE_DURATION` - Cache duration for auth checks (env: NEXT_PUBLIC_AUTH_CACHE_DURATION)
  - `ERROR_RETRY_DELAY` - Error retry delay (env: NEXT_PUBLIC_ERROR_RETRY_DELAY)
  - `MAX_ERROR_COUNT` - Maximum consecutive errors threshold
  - `MAX_BACKOFF_DELAY` - Maximum exponential backoff delay

### Environment Variables
- **Authentication**: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- **Database**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_SUPABASE_SERVICE_ROLE_KEY`
- **Blockchain**: `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`, `LOCK_MANAGER_PRIVATE_KEY`
- **Payments**: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
- **Admin**: `ADMIN_SESSION_TTL_SECONDS`, `ADMIN_SESSION_JWT_SECRET`
- **Admin Context**: `NEXT_PUBLIC_AUTH_CACHE_DURATION`, `NEXT_PUBLIC_ERROR_RETRY_DELAY`

### Configuration Files
- **`next.config.js`** - Next.js configuration
- **`tailwind.config.js`** - TailwindCSS configuration
- **`tsconfig.json`** - TypeScript configuration
- **`jest.config.js`** - Jest testing configuration
- **`supabase/config.toml`** - Supabase configuration

---

## Testing & Development

### Test Structure (`__tests__/`)
- **`pages/api/`** - API endpoint tests
- **`unit/`** - Unit tests for components, hooks, and utilities
  - `app/` - App-specific tests
  - `components/` - Component tests
  - `contexts/` - Context provider tests
    - `AdminAuthContext.test.tsx` - Comprehensive tests for AdminAuthContext provider and hook
  - `hooks/` - Hook tests
  - `lib/` - Library tests

### Test Configuration
- **Jest** - Testing framework
- **Testing Library** - React component testing
- **jsdom** - DOM environment for tests
- **Coverage reporting** - Test coverage analysis

### Development Scripts
- **`npm run dev`** - Development server with Turbopack
- **`npm run build`** - Production build
- **`npm run test`** - Run tests
- **`npm run test:coverage`** - Run tests with coverage
- **`npm run lint`** - Linting and formatting
- **`npm run db:migrate`** - Database migrations

---

## Documentation

### Architecture Documentation
- **`ADMIN_AUTH_CONTEXT_MIGRATION_PLAN.md`** - Comprehensive execution plan for migrating admin authentication from individual hook usage to centralized React Context architecture to solve RPC rate limiting issues
- **`AUTHENTICATION_ARCHITECTURE.md`** - Authentication system design
- **`AUTHENTICATION_DEVELOPER_GUIDE.md`** - Developer authentication guide
- **`UNIFIED_AUTH_ARCHITECTURE.md`** - Unified authentication architecture
- **`CSP_IMPLEMENTATION_GUIDE.md`** - Content Security Policy guide

### Feature Documentation
- **`daily-checkin-implementation.md`** - Daily check-in system
- **`ethereum-attestation-service-integration.md`** - EAS integration
- **`admin-sessions-and-bundle-apis.md`** - Admin session system
- **`retryable-error-ux.md`** - Error handling UX

### Payment Documentation
- **`unlock-payment-guide.md`** - Unlock payment integration
- **`Unlock-paystack-guide.md`** - Paystack integration
- **`unlock_crypto_purchase_guide.md`** - Crypto payment guide

### Development Documentation
- **`logging.md`** - Logging system guide
- **`admin-fetch-conversion-plan.md`** - Admin fetch conversion
- **`Road_to_production.md`** - Production deployment guide

### User Research
- **`user-testing-strategy.md`** - User testing approach
- **`user-testing-recruitment-materials.md`** - Testing recruitment

### Business Documentation
- **`unlock-dao-presentation.md`** - Unlock DAO presentation

---

## Quick Reference

### Most Used Components
- **`components/ui/button.tsx`** - Button component
- **`components/ui/card.tsx`** - Card layout
- **`components/layouts/MainLayout.tsx`** - Main layout
- **`components/PrivyConnectButton.tsx`** - Authentication

### Most Used Hooks
- **`useAdminApi.ts`** - Admin API calls
- **`useAdminAuthContext.ts`** - Admin authentication context
- **`useBootcamps.ts`** - Bootcamp data
- **`useUserEnrollments.ts`** - User enrollments
- **`useWalletBalances.ts`** - Wallet balances

### Most Used Utilities
- **`lib/utils/logger`** - Logging system
- **`lib/unlock/lockUtils.ts`** - Unlock operations
- **`lib/auth/privy.ts`** - Authentication helpers
- **`lib/supabase/client.ts`** - Database client

### Key API Endpoints
- **`/api/user/profile`** - User profile management
- **`/api/bootcamps`** - Bootcamp listing
- **`/api/applications`** - Application submission
- **`/api/admin/session`** - Admin session management

---

## Maintenance Notes

### Adding New Components
1. Create component in appropriate `components/` subdirectory
2. Add to relevant index.ts file for exports
3. Update this glossary with component description
4. Add TypeScript types if needed

### Adding New Hooks
1. Create hook in `hooks/` directory
2. Follow naming convention `use[FeatureName].ts`
3. Add comprehensive JSDoc comments
4. Update this glossary with hook description

### Adding New API Endpoints
1. Create endpoint in `pages/api/` or `app/api/`
2. Add proper authentication/authorization
3. Include error handling and logging
4. Update this glossary with endpoint description

### Database Changes
1. Create migration in `supabase/migrations/`
2. Update TypeScript types in `lib/supabase/types.ts`
3. Test migration locally and remotely
4. Update this glossary with schema changes

---

*This glossary is maintained as a living document. Please update it when adding, modifying, or removing modules from the project.*