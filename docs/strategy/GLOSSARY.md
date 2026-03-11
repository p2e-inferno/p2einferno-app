# P2E Inferno - Project Glossary

> **Last Updated**: March 2026
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
- **Frontend**: Next.js 16.1.6, React 18, TypeScript, TailwindCSS
- **Authentication**: Privy (multi-wallet, social login)
- **Database**: Supabase (PostgreSQL + pgvector for AI KB)
- **Blockchain**: Base/Ethereum, Unlock Protocol, EAS (Ethereum Attestation Service), Viem v2, Ethers v6
- **AI**: OpenRouter (chat completions, embeddings via `openai/text-embedding-3-small`)
- **Payments**: Paystack (fiat), Unlock Protocol (crypto)
- **Identity**: GoodDollar (face verification / Sybil resistance)
- **Notifications**: Mailgun (email), Telegram Bot API
- **UI**: Radix UI, Lucide Icons, Tabler Icons, Framer Motion, Tiptap (rich text), Embla Carousel
- **State Management**: TanStack Query v5, React Context
- **Token Exchange**: Uniswap V3 (on Base), DG Token Vendor contract

---

## Frontend Components

### User-Facing Components

#### Homepage Components (`components/home/`)
- **`Hero.tsx`** - Main landing page hero section with CTA
- **`Features.tsx`** - 6 platform differentiators with descriptions (Sybil Defence, Real Onchain Actions, etc.)
- **`About.tsx`** - "What is P2E INFERNO?" section with 3 pillars
- **`Services.tsx`** - Services offered by the platform
- **`Bootcamps.tsx`** - Bootcamp programs display
- **`HowItWorks.tsx`** - How the platform works explanation
- **`FAQ.tsx`** - Accordion-based FAQ section (5 items) using Radix UI
- **`Personas.tsx`** - Persona-based CTA cards with LeadMagnetModal integration
- **`StarterKitSection.tsx`** - Lead magnet CTA section embedding LeadMagnetForm
- **`RealHumans.tsx`** - GoodDollar human verification marketing section
- **`Navbar.tsx`** - Main navigation component
- **`Footer.tsx`** - Footer component

#### Lobby Components (`components/lobby/`)
- **`checkin-strip.tsx`** - Inline checkin/streak strip shown in lobby header
- **`connect-wallet-state.tsx`** - Full-screen wallet connection prompt
- **`current-enrollments.tsx`** - List of user's active cohort enrollments
- **`error-state.tsx`** - Error state handling component
- **`loading-state.tsx`** - Loading skeleton state
- **`lobby-background.tsx`** - Animated lobby background graphic
- **`lobby-navigation.tsx`** - Side navigation for lobby sections
- **`LobbyConfirmationModal.tsx`** - Lobby confirmation modal
- **`MilestoneProgressRing.tsx`** - SVG ring showing milestone task completion percentage
- **`MilestoneTaskClaimButton.tsx`** - Button to claim milestone task rewards with gasless attestation
- **`MilestoneTimer.tsx`** - Countdown timer for milestone start/end dates
- **`NotificationBell.tsx`** - Notification bell with unread count dropdown
- **`pending-applications-alert.tsx`** - Alert banner for pending applications
- **`quick-actions-grid.tsx`** - Quick action cards grid layout
- **`stats-grid.tsx`** - XP, streak, and key stats grid
- **`TaskSubmissionModal.tsx`** - Modal for submitting milestone task proof/evidence
- **`verification-banner.tsx`** - CTA banner prompting GoodDollar verification
- **`welcome-section.tsx`** - Welcome header for the lobby
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

#### Bootcamp Completion (`components/bootcamp-completion/`)
- **`CertificateClaimButton.tsx`** - Button to claim completion certificate with preview modal
- **`CompletionBadge.tsx`** - Visual badge for bootcamp completion

#### Profile Components (`components/profile/`)
- **`account-card.tsx`** - User account information card
- **`completion-call-to-action.tsx`** - Profile completion CTA
- **`linked-accounts-section.tsx`** - Linked accounts display
- **`multi-wallet-card.tsx`** - Card displaying multiple linked wallet addresses
- **`profile-header.tsx`** - Profile header with avatar/ENS
- **`index.ts`** - Profile components exports
- **`types.ts`** - Profile component types

#### Quest Components (`components/quests/`)
- **`quest-card.tsx`** - Individual quest display card
- **`quest-list.tsx`** - Quest listing with filtering/grouping
- **`QuestHeader.tsx`** - Quest header component
- **`TaskItem.tsx`** - Individual task item component (quests and daily quests)
- **`DailyQuestCountdown.tsx`** - Countdown timer to next UTC midnight for daily quest reset
- **`DeployLockTaskForm.tsx`** - Form for submitting deploy-lock tx hashes with network/reward display
- **`daily-quest-card.tsx`** - Card for displaying a daily quest run in lobby
- **`daily-quest-list.tsx`** - List rendering all daily quest runs
- **`index.ts`** - Quest components exports
- **`types.ts`** - Quest component types

#### Check-in Components (`components/checkin/`)
- **`CheckinCard.tsx`** - Full checkin card combining button and streak display
- **`DailyCheckinButton.tsx`** - Interactive check-in button with visual feedback
- **`StreakDisplay.tsx`** - Streak info with tier progress and multipliers
- **`index.tsx`** - Check-in components exports

#### GoodDollar Components (`components/gooddollar/`)
- **`FaceVerificationButton.tsx`** - Button to launch GoodDollar face verification flow
- **`VerificationStatus.tsx`** - Displays current GoodDollar verification status

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

#### Subscription Components (`components/subscription/`)
- **`CryptoRenewalModal.tsx`** - Modal for on-chain DG token subscription purchase/renewal
- **`XpRenewalModal.tsx`** - Modal for XP-based subscription renewal
- **`LockPriceDisplay.tsx`** - Displays current lock key price in DG/ETH
- **`MethodSelectionModal.tsx`** - Modal to choose between XP vs. crypto renewal
- **`SubscriptionStatusCard.tsx`** - Card showing subscription expiry and renewal options

#### Token Withdrawal Components (`components/token-withdrawal/`)
- **`WithdrawDGButton.tsx`** - Trigger button for DG withdrawal modal
- **`WithdrawDGModal.tsx`** - Multi-step modal for EIP-712 signed DG token withdrawal
- **`WithdrawalHistoryTable.tsx`** - Paginated table of user withdrawal history

#### Vendor Components (`components/vendor/`)
- **`VendorSwap.tsx`** - Buy/sell DG tokens via vendor contract with GoodDollar gate
- **`UniswapSwapTab.tsx`** - Uniswap V3 swap tab with stepper integration
- **`LevelUpCard.tsx`** - Card for vendor level-up action
- **`LightUpButton.tsx`** - Button to "light up" (stake) DG via vendor contract
- **`PercentPresets.tsx`** - Percentage preset buttons (25%, 50%, 75%, 100%) for swap amounts

#### Marketing Components (`components/marketing/`)
- **`LeadMagnetForm.tsx`** - Email capture form for starter kit / bootcamp waitlist leads
- **`LeadMagnetModal.tsx`** - Modal wrapper around LeadMagnetForm

#### Unlock Components (`components/unlock/`)
- **`UnlockPurchaseButton.tsx`** - Unlock key purchase button
- **`UnlockUtilsDemo.tsx`** - Unlock utilities demonstration

#### Blockchain Components (`components/blockchain/`)
- **`NetworkSelector.tsx`** - Generic network selector for blockchain-aware forms

#### Dashboard Components (`components/dashboard/`)
- **`bottom-dock.tsx`** - Bottom dock navigation for mobile lobby

#### Cohort Components (`components/cohort/`)
- **`weekly-content-card.tsx`** - Weekly content display card
- **`types.ts`** - Cohort component types

### Admin Components (`components/admin/`)

#### Admin Dashboard & Layout
- **`AdminDashboard.tsx`** - Main admin dashboard with module navigation
- **`AdminSessionGate.tsx`** - HOC-style gate that renders children only after admin session is valid
- **`AdminAccessRequired.tsx`** - Admin access requirement component
- **`AdminSessionRequired.tsx`** - UI prompt to create admin session when expired
- **`AdminEditPageLayout.tsx`** - Reusable layout shell for admin edit pages with loading/error states
- **`AdminListPageLayout.tsx`** - Reusable layout shell for admin list pages with add button
- **`AdminNavigation.tsx`** - Admin navigation component
- **`AdminResponsiveTable.tsx`** - Responsive table with mobile-first accordion expand rows

#### Admin Forms & Management
- **`BootcampForm.tsx`** - Bootcamp creation/editing form
- **`CohortForm.tsx`** - Cohort creation/editing form
- **`MilestoneForm.tsx`** - Milestone creation/editing form
- **`MilestoneFormEnhanced.tsx`** - Enhanced milestone form with inline task editing and gasless attestation
- **`QuestForm.tsx`** - Quest creation/editing form
- **`QuestTaskForm.tsx`** - Quest task creation/editing form
- **`DailyQuestForm.tsx`** - Daily quest template CRUD form with task management
- **`DailyQuestList.tsx`** - Admin list view of daily quest templates
- **`DailyQuestTaskForm.tsx`** - Individual daily quest task configuration form
- **`ProgramHighlightsForm.tsx`** - Program highlights form
- **`ProgramRequirementsForm.tsx`** - Program requirements form
- **`WithdrawalLimitsConfig.tsx`** - DG token min/max withdrawal limits config with audit log
- **`TransactionStepperModal.tsx`** - Generic multi-step transaction modal driven by `lib/transaction-stepper`

#### Admin Data Display & Tables
- **`CohortsTable.tsx`** - Cohorts data table
- **`MilestoneList.tsx`** - Milestone list component
- **`TaskList.tsx`** - Task list component
- **`TaskSubmissions.tsx`** - Task submissions management
- **`QuestSubmissionsTable.tsx`** - Quest submissions table
- **`SubmissionReviewModal.tsx`** - Submission review modal
- **`KeyGrantReconciliation.tsx`** - Key grant reconciliation component

#### Admin Security & Lock Management
- **`MaxKeysSecurityBadge.tsx`** - Badge when lock's max-keys config is insecure
- **`MaxKeysSecurityButton.tsx`** - Button to trigger max-keys security sync
- **`SyncLockStateButton.tsx`** - Syncs on-chain lock manager and security state to DB
- **`TransferabilitySecurityBadge.tsx`** - Badge when lock is transferable (security risk)
- **`TransferabilitySecurityButton.tsx`** - Button to trigger transferability security sync
- **`PendingLockManagerBadge.tsx`** - Badge for pending lock manager update
- **`LockManagerRetryButton.tsx`** - Retry failed lock manager operations
- **`LockManagerToggle.tsx`** - Enable/disable lock manager toggle

#### Admin Bootcamp Completion
- **`bootcamp-completion/ReconciliationPanel.tsx`** - Admin UI to trigger cohort status reconciliation

#### Admin EAS Schema Manager (`components/admin/eas-schemas/`)
- **`EasConfigPanel.tsx`** - Admin tab for configuring EAS network DB settings
- **`NetworkSelector.tsx`** - Dropdown for selecting EAS-enabled networks
- **`SchemaDeploymentForm.tsx`** - Form to deploy a new EAS schema on-chain
- **`SchemaDetailsCard.tsx`** - Schema details card with EAS Scan link and UID status
- **`SchemaKeySelect.tsx`** - Select for choosing schema key from `eas_schema_keys` table
- **`SchemaListTable.tsx`** - Table listing deployed schemas per network
- **`SchemaSyncPanel.tsx`** - Panel to sync schemas from chain to DB

#### Admin Utilities
- **`withAdminAuth.tsx`** - HOC for admin authentication (redirects unauthenticated users)
- **`withAdminFormErrorHandling.tsx`** - HOC for admin form error handling

### UI Components (`components/ui/`)
- **`accordion.tsx`** - Radix UI Accordion wrapper
- **`auth-error.tsx`** - Authentication error display with Privy re-login
- **`badge.tsx`** - Badge/label components
- **`button.tsx`** - Button component with variants
- **`card.tsx`** - Card layout components
- **`carousel.tsx`** - Embla Carousel wrapper
- **`confirmation-dialog.tsx`** - Confirmation dialog with danger/warning/default variants
- **`copyable-address.tsx`** - Truncated wallet address with one-click copy
- **`dialog.tsx`** - Dialog/modal components
- **`dismissible-toast.tsx`** - Toast content with visible close button
- **`image-upload.tsx`** - Image upload with Supabase Storage backend
- **`input.tsx`** - Input field components
- **`label.tsx`** - Label components
- **`loading-button.tsx`** - Loading state button component
- **`loading-overlay.tsx`** - Loading overlay component
- **`network-error.tsx`** - Network error display with retry button
- **`notification-center.tsx`** - Notification display with type-based icons
- **`PageHeader.tsx`** - Reusable page header component
- **`progress-steps.tsx`** - Step indicator for multi-step flows
- **`progress.tsx`** - Progress bar components
- **`rich-text-editor.tsx`** - Tiptap WYSIWYG editor with markdown I/O
- **`select.tsx`** - Select dropdown components
- **`separator.tsx`** - Visual separator component
- **`SuccessScreen.tsx`** - Full-page success state screen
- **`tabs.tsx`** - Tab navigation components (Radix UI)
- **`textarea.tsx`** - Textarea components
- **`toggle.tsx`** - Accessible boolean toggle
- **`wallet-fallback-toast.tsx`** - Toast shown when wallet falls back to embedded wallet

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

### Layout Components (`components/layouts/`)
- **`MainLayout.tsx`** - Main application layout
- **`AdminLayout.tsx`** - Admin-specific layout
- **`lobby-layout.tsx`** - Lobby page layout (navigation, background, wallet gate)

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

### Static Content (`lib/content/`)
- **`about.ts`** - Static copy for the About page (hero, values, tracks, team)
- **`bootcamps.ts`** - Static copy for the Bootcamps marketing page (tracks, FAQs)
- **`how-it-works.ts`** - Static copy for the How It Works page (5-step journey, value equation)
- **`quests.ts`** - Static copy for the Quests marketing page (categories, rewards)
- **`services.ts`** - Static copy for the Services marketing page (6 services, deliverables, metrics)

---

## React Hooks

### Authentication & Admin Hooks
- **`useAdminApi.ts`** - Admin API calls with session management, auto-refresh, and `suppressToasts` option
- **`useAdminAuthWithSession.ts`** - Admin authentication with session handling
- **`useAdminFetchOnce.ts`** - One-time admin data fetching with composite key `[auth + wallet + keys]`, TTL, and throttle
- **`useAdminSession.ts`** - Admin session management and validation
- **`useLockManagerAdminAuth.ts`** - Lock manager admin auth with wallet-session validation (session hijack protection)
- **`useVerifyToken.ts`** - Token verification hook for authentication
- **`useAdminQuestOptions.ts`** - Fetches all quests for admin form select dropdowns

### Admin Context Hooks (`contexts/admin-context/hooks/`)
- **`useAdminAuthContextInternal.ts`** - Main composition hook combining all AdminAuthContext functionality
- **`useAdminAuthContextActions.ts`** - Action methods management (refresh, session creation, error handling)
- **`useAdminAuthContextState.ts`** - Internal state management with error tracking and caching

### User & Profile Hooks
- **`useUserEnrollments.ts`** - User enrollment data management and tracking
- **`useDashboardData.ts`** - Dashboard data aggregation and caching
- **`useDetectConnectedWalletAddress.ts`** - Connected wallet address detection
- **`useENSResolution.ts`** - ENS name resolution and reverse lookup
- **`useSmartWalletSelection.tsx`** - Smart wallet selection (embedded vs. external) with chain-aware fallback
- **`useWalletBalances.ts`** - Wallet balance tracking with polling and gating (`{ enabled, pollIntervalMs }`)
- **`useWalletManagement.ts`** - Wallet management operations and state
- **`useGoodDollarVerification.ts`** - TanStack Query hook for GoodDollar verification status with ownership conflict handling

### Bootcamp & Application Hooks
- **`useBootcamps.ts`** - Bootcamp data fetching and management
- **`useBootcampPayment.ts`** - Bootcamp payment processing and verification
- **`useCohortDetails.ts`** - Cohort information management and enrollment status
- **`usePayment.ts`** - General payment processing and status tracking
- **`useMilestoneClaim.ts`** - Milestone claim processing and validation

### Bootcamp Completion Hooks (`hooks/bootcamp-completion/`)
- **`useBootcampCompletionStatus.ts`** - Fetches cohort completion status and certificate info
- **`useCertificateClaim.ts`** - Handles certificate claim flow (preview + on-chain commit)

### Quest & Activity Hooks
- **`useQuests.ts`** - Quest data and progress management with task tracking
- **`useDailyQuests.ts`** - Daily quest run state, eligibility evaluation
- **`useNotifications.ts`** - Notification system management and real-time updates
- **`useTelegramNotifications.ts`** - Polls for Telegram bot activation after deep-link click

### Check-in Hooks (`hooks/checkin/`)
- **`useDailyCheckin.ts`** - Main orchestrator for daily check-in with streak, XP, and EAS integration
- **`useDelegatedAttestationCheckin.ts`** - Signs delegated EIP-712 EAS attestation (gasless) for checkin
- **`useStreakData.ts`** - Streak tracking and tier progression with visibility-aware polling
- **`useStreakDisplay.ts`** - Streak display utilities and formatting
- **`useCheckinEligibility.ts`** - Check-in eligibility checking without full state management
- **`useCheckinWithStreak.ts`** - Combined check-in and streak hook with convenience methods
- **`useVisibilityAwarePoll.ts`** - Pauses polling when tab is hidden

### Attestation Hooks (`hooks/attestation/`)
- **`useAttestations.ts`** - Attestation data management and creation
- **`useAttestationSchemas.ts`** - Attestation schema management per network
- **`useAttestationQueries.ts`** - TanStack Query hooks for attestation queries and stats
- **`useGaslessAttestation.ts`** - Signs delegated EAS attestations gaslessly using EAS SDK

### Unlock Protocol Hooks (`hooks/unlock/`)
- **`useDeployLock.ts`** - Deploys an Unlock Protocol lock from user's wallet
- **`useDeployAdminLock.ts`** - Deploys an admin-managed lock with additional config steps
- **`useSyncLockManagerState.ts`** - Syncs on-chain lock manager address to DB
- **`useSyncLockSecurityState.ts`** - Syncs on-chain max-keys security config to DB
- **`useSyncLockTransferabilityState.ts`** - Syncs on-chain transfer fee to DB
- **`usePrivyWriteWallet.ts`** - Resolves Privy's embedded wallet for write transactions
- **`useLockManagerClient.ts`** - Browser-side singleton LockManager with deduped on-chain key lookups

### Vendor Hooks (`hooks/vendor/`)
- **`useDGMarket.ts`** - Buy/sell DG tokens via vendor contract with wagmi/viem
- **`useDGVendorAccess.ts`** - Checks vendor access (DG Nation key, GoodDollar verification, stage)
- **`useDGProfile.ts`** - Fetches user's DG profile data from on-chain or DB
- **`useDGTokenBalances.ts`** - Real-time DG and ETH balance polling
- **`useDGLightUp.ts`** - Executes "light up" (stake) action on vendor contract
- **`useUniswapSwap.ts`** - Uniswap V3 swap with quoting, balance checks, and Permit2

### Subscription Hooks
- **`useXpRenewal.ts`** - Orchestrates XP-based subscription renewal with stepper and attestation

### Withdrawal Hooks
- **`useWithdrawalAccess.ts`** - Checks withdrawal access (DG Nation key + GoodDollar verification)
- **`useWithdrawalLimits.ts`** - Fetches public withdrawal limits config

### Security Hooks
- **`useMaxKeysSecurityState.ts`** - Tracks max-keys on-chain security state
- **`useTransferabilitySecurityState.ts`** - Tracks lock transferability security state

### Utility Hooks
- **`useApiCall.ts`** - Generic API call management with error handling
- **`useRetryable.ts`** - Retryable operation management with loading/error state
- **`useScrollbarFix.ts`** - Scrollbar styling fixes for cross-browser compatibility
- **`useMessageSigning.ts`** - Message signing operations for blockchain interactions
- **`useTOSSigning.ts`** - Terms of service signing and verification
- **`useTransactionStepper.ts`** - Multi-step blockchain transaction orchestration

---

## Utility Functions & Libraries

### Root-Level Libraries (`lib/`)
- **`api.ts`** - Axios-based API client with interceptors, error handling, and logging
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
- **`lock-deployment-state.ts`** - localStorage-backed pending lock deployment state tracker
- **`milestone-utils.ts`** - Milestone-related utility functions
- **`rate-limiter.ts`** - In-memory IP-based rate limiter with TTL cleanup
- **`registration-validation.ts`** - Registration validation utilities
- **`wallet-address.ts`** - Wallet address formatting and validation
- **`logger/`** - Comprehensive logging system
  - `core.ts` - Core logging functionality and interface
  - `formatting.ts` - Log formatting utilities
  - `index.ts` - Logger exports (`getLogger(module)`)
  - `levels.ts` - Log level definitions (`debug|info|warn|error|silent`)
  - `sanitize.ts` - Log sanitization utilities
  - `transport.ts` - Log transport mechanisms (browser: `window.__P2E_LOGS__`, server: JSON)

### Authentication Utilities (`lib/auth/`)
- **`admin-auth.ts`** - Admin authentication middleware and validation
- **`admin-key-checker.ts`** - Admin key checking (parallel key checks)
- **`admin-session.ts`** - Admin session JWT issuance, verification, and cookie management
- **`admin-signed-actions.ts`** - EIP-712 signed admin action payload creation and verification
- **`admin-action-payload.ts`** - Admin action nonce management for replay prevention
- **`config-validation.ts`** - Configuration validation (required admin env vars)
- **`error-handler.ts`** - Authentication error handling and structured responses
- **`ownership.ts`** - Ownership validation utilities
- **`privy.ts`** - Privy authentication helpers (`getPrivyUser` with JWT fallback)
- **`wallet-link-map.ts`** - Wallet-to-user linkage uniqueness with conflict detection
- **`hooks/`** - Authentication hooks
  - `useAuth.ts` - Authentication state management hook
- **`route-handlers/`** - Route handler utilities
  - `admin-guard.ts` - `ensureAdminOrRespond()` — unified admin guard for App Router handlers

### AI System (`lib/ai/`)
- **`client.ts`** - Fetch-based OpenRouter chat completion client (server-only)
- **`index.ts`** - Public API exports (chatCompletion, types)
- **`types.ts`** - AIRequestOptions, AIResult, ChatMessage, MessageContent types
- **`verification/vision.ts`** - Vision analysis helper for AI screenshot verification

### AI Knowledge Base (`lib/ai/knowledge/`)
- **`chunking.ts`** - Deterministic markdown chunking by headings (1500-char soft cap, 2000 hard cap)
- **`embeddings.ts`** - OpenRouter embeddings with batch support (`openai/text-embedding-3-small`)
- **`retrieval.ts`** - Hybrid search (semantic + keyword RRF) against `ai_kb_chunks` pgvector table
- **`sources.ts`** - Loads/validates source registry from `automation/config/ai-kb-sources.json`
- **`types.ts`** - KnowledgeChunk, KnowledgeSourceEntry, KnowledgeSourceRegistry types

### Email System (`lib/email/`)
- **`mailgun.ts`** - Mailgun API client with HTML templating and attachment support
- **`templates.ts`** - Branded HTML email templates (starter kit, admin review notification)
- **`admin-notifications.ts`** - Triggers admin email + Telegram on task submission review
- **`dedup.ts`** - Atomic email send deduplication via `email_events` DB table
- **`helpers.ts`** - Context extractors for milestone/quest submission emails
- **`index.ts`** - Public API exports

### GoodDollar Integration (`lib/gooddollar/`)
- **`identity-sdk.ts`** - Server-side GoodDollar IdentitySDK factory with Celo chain support
- **`callback-handler.ts`** - GoodDollar verify callback response processing
- **`error-handler.ts`** - GoodDollar-specific error codes and HTTP response shaping
- **`generate-fv-link.ts`** - Generates face verification deep-link URLs
- **`get-display-name.ts`** - Resolves display name from Privy user (ENS > Telegram > email > address)
- **`use-identity-sdk.ts`** - Client-side React hook wrapping IdentitySDK
- **`verification-ownership.ts`** - One-wallet-per-user and one-user-per-wallet constraints

### Quest System (`lib/quests/`)
- **`taskVerificationMethod.ts`** - Resolves verification method (auto vs. manual) per task type
- **`sort-tasks.ts`** - Sorts quest tasks by display order
- **`txHash.ts`** - Normalizes and validates transaction hash strings
- **`prerequisite-checker.ts`** - Quest/daily-quest prerequisite condition checks
- **`trial-eligibility.ts`** - DG trial eligibility check (no existing key, no prior trial)
- **`vendor-task-config.ts`** - Validates vendor task configuration (buy/sell/light-up/level-up)
- **`vendorTaskTypes.ts`** - Type-safe lists of vendor task type constants

### Quest Verification (`lib/quests/verification/`)
- **`registry.ts`** - Strategy registry mapping task types to verification implementations
- **`types.ts`** - VerificationStrategy interface and VerificationResult types
- **`ai-vision-verification.ts`** - AI screenshot verification (auto-approve/retry/defer)
- **`vendor-verification.ts`** - Verifies vendor buy/sell/light-up tx hashes on-chain
- **`deploy-lock-verification.ts`** - Verifies Unlock lock deployment tx with network-based reward multipliers
- **`deploy-lock-utils.ts`** - Validates deploy-lock task config (supported networks, contract addresses)
- **`uniswap-verification.ts`** - Verifies Uniswap V3 swap events from tx receipts
- **`daily-checkin-verification.ts`** - Verifies daily check-in was completed today
- **`replay-prevention.ts`** - Tracks tx hashes to prevent double-counting

### Daily Quests (`lib/quests/daily-quests/`)
- **`constraints.ts`** - Evaluates daily quest eligibility (wallet, verification, vendor stage)
- **`runs.ts`** - Ensures today's daily quest runs exist, sends refresh notifications
- **`replay-prevention.ts`** - Daily-quest-specific tx hash deduplication

### Blockchain Utilities (`lib/blockchain/`)
- **`admin-lock-config.ts`** - Admin lock configuration management
- **`client-config.ts`** - Client-side blockchain configuration
- **`config.ts`** - General blockchain configuration
- **`frontend-config.ts`** - Frontend-specific blockchain configuration
- **`grant-key-service.ts`** - Key granting service implementation
- **`index.ts`** - Blockchain utilities exports
- **`lock-manager.ts`** - Lock management utilities
- **`provider.ts`** - Singleton ethers read-only provider for frontend
- **`server-config.ts`** - Server-side blockchain configuration
- **`transaction-helpers.ts`** - Transaction helper utilities
- **`config/`** - Blockchain configuration
  - `unified-config.ts` - Unified blockchain configuration (`getClientRpcUrls()`)
  - `core/chain-resolution.ts` - `resolveChain()`, `resolveRpcUrls()` with chain-map lookup
  - `core/chain-map.ts` - Chain ID to chain object mapping
  - `core/settings.ts` - Environment-driven config settings
  - `core/types.ts` - BlockchainConfig, ChainConfig, RpcFallbackSettings types
  - `core/validation.ts` - Runtime blockchain config validation
  - `clients/public-client.ts` - `createPublicClientUnified()`, `createPublicClientForNetwork()`, `createPublicClientForChain()`
  - `clients/wallet-client.ts` - `createWalletClientUnified()`, `createWalletClientForNetwork()`
  - `clients/alchemy-client.ts` - Alchemy-specific public client factory
  - `clients/ethers-adapter-client.ts` - Ethers v6 provider adapter for legacy code
  - `clients/account.ts` - Private key account factory from env
  - `transport/viem-transport.ts` - Sequential fallback viem transport with RPC retry
- **`services/`** - Blockchain services
  - `schema-deployment-service.ts` - Deploys EAS schemas on-chain
  - `identity-resolver.ts` - ENS lookup + address formatting
  - `grant-key-service.ts` - Low-level `grantKey()` viem call to Unlock lock contract
  - `transaction-service.ts` - `getBlockExplorerUrl()` and tx utilities
- **`providers/`** - Provider factories
  - `lock-manager.ts` - `createBrowserLockManager()` browser LockManager service factory
  - `privy-viem.ts` - `createViemFromPrivyWallet()` and `createViemPublicClient()`
- **`shared/`** - Shared blockchain utilities
  - `abi-definitions.ts` - ABI definitions and constants
  - `vendor-abi.ts` - DGTokenVendor contract ABI
  - `vendor-constants.ts` - Vendor stage labels, constants
  - `vendor-types.ts` - Vendor-related TypeScript types
  - `grant-state.ts` - Grant state tracking types
  - `lock-config-converter.ts` - Lock config format conversion
  - `ensure-wallet-network.ts` - Ensures wallet is on correct network
  - `client-utils.ts` - Client-side blockchain utilities
  - `error-utils.ts` - Blockchain error handling utilities
  - `logger-bridge.ts` - Logger bridge for blockchain operations
  - `logging-utils.ts` - Blockchain-specific logging utilities
  - `network-utils.ts` - Network utility functions
  - `transaction-utils.ts` - `extractLockAddressFromReceipt()` and tx parsing

### Uniswap V3 Integration (`lib/uniswap/`)
- **`quote.ts`** - `getQuoteExactInputSingle()` via QuoterV2 (view call, no gas)
- **`pool.ts`** - `fetchPoolState()` reads token0/token1/fee/liquidity/slot0
- **`encode-swap.ts`** - Encodes swap calldata for exactInputSingle
- **`permit2.ts`** - Permit2 signature generation for token approvals
- **`constants.ts`** - Uniswap contract addresses on Base
- **`types.ts`** - SwapDirection, SwapPair, QuoteResult, PoolState types
- **`abi/`** - QuoterV2 and pool ABI fragments

### Token Withdrawal (`lib/token-withdrawal/`)
- **`types.ts`** - WithdrawalRecord, WithdrawalLimits, WithdrawalRequest types
- **`eip712/client-signing.ts`** - Client-side EIP-712 typed data signing for withdrawals
- **`eip712/server-verification.ts`** - Server-side verification of EIP-712 withdrawal signatures
- **`eip712/types.ts`** - Withdrawal domain and typed data definitions
- **`functions/dg-transfer-service.ts`** - Server-side DG token transfer via private key wallet

### Unlock Protocol (`lib/unlock/`)
- **`lockUtils.ts`** - Comprehensive Unlock protocol utilities
  - Read operations: `getTotalKeys`, `checkKeyOwnership`, `getUserKeyBalance`, `getKeyPrice`, `getIsLockManager`
  - Wallet operations: `purchaseKey`
  - Advanced management: `deployLock`, `grantKeys`, `addLockManager`
  - Utilities: `getBlockExplorerUrl`

### Attestation System (`lib/attestation/`)
- **`index.ts`** - Main attestation system exports
- **`api/`** - API helpers
  - `helpers.ts` - Reusable `handleGaslessAttestation()` server helper
  - `commit-guards.ts` - Guards to prevent duplicate attestation commits
  - `types.ts` - DelegatedAttestationSignature types
- **`core/`** - Core attestation functionality
  - `config.ts` - `isEASEnabled()`, `EAS_CONFIG`, SchemaKey enum
  - `delegated.ts` - EAS SDK delegated attestation creation (server-side)
  - `index.ts` - Core exports
  - `network-config.ts` - DB-backed EAS network config with 30s cache
  - `service.ts` - High-level attestation service
  - `types.ts` - Core attestation types
- **`database/`** - Database operations
  - `index.ts` - Database exports
  - `queries.ts` - Database query utilities
- **`schemas/`** - Schema management
  - `definitions.ts` - Schema field definitions
  - `index.ts` - Schema exports
  - `registry.ts` - Schema registry DB queries
  - `schema-key-db.ts` - `ensureActiveSchemaKey()` — validates/resolves from DB
  - `schema-key-utils.ts` - `normalizeSchemaKey()`, `isValidSchemaKey()`
  - `network-resolver.ts` - `resolveSchemaUID()` — DB-then-env fallback
- **`utils/`** - Attestation utilities
  - `encoder.ts` - Schema encoding utilities
  - `helpers.ts` - General attestation helpers
  - `hex.ts` - `isBytes32Hex()` type guard
  - `index.ts` - Utility exports
  - `validator.ts` - `isValidSchemaDefinition()` for schema string validation

### Check-in System (`lib/checkin/`)
- **`index.ts`** - Check-in system exports
- **`core/`** - Core check-in functionality
  - `schemas.ts` - Zod validation schemas for checkin data
  - `service.ts` - Checkin service orchestrating streak, XP, and EAS attestation
  - `types.ts` - CheckinData, CheckinStatus, MultiplierTier types
- **`streak/`** - Streak management
  - `calculator.ts` - Streak calculation (current streak, status, anchor date)
  - `multiplier.ts` - Multiplier tier lookup based on streak length
- **`xp/`** - Experience point management
  - `calculator.ts` - XP calculation utilities
  - `updater.ts` - XP update and management

### Bootcamp Completion (`lib/bootcamp-completion/`)
- **`service.ts`** - Completion service (checks completion, triggers certificate)
- **`types.ts`** - CompletionStatus, CertificateStatus types
- **`certificate/image-service.ts`** - Validates/saves certificate image URLs
- **`certificate/service.ts`** - Certificate generation and on-chain commit
- **`certificate/types.ts`** - Certificate-specific types

### Transaction Stepper (`lib/transaction-stepper/`)
- **`types.ts`** - StepPhase, TxResult, StepRuntimeState types for multi-step blockchain UX

### Webhooks (`lib/webhooks/`)
- **`meta-whatsapp/forward.ts`** - Meta HMAC signature verification, webhook payload forwarding

### Notifications (`lib/notifications/`)
- **`telegram.ts`** - Telegram Bot API messaging; notification type → emoji mapping; broadcast support

### Helpers (`lib/helpers/`)
- **`key-manager-utils.ts`** - `getKeyManagersForContext()` — correct key managers by context (payment/milestone/admin_grant/reconciliation)
- **`checkAndUpdateMilestoneKeyClaimStatus.ts`** - On-chain key ownership check + DB status update
- **`payment-helpers.ts`** - Shared payment processing utilities
- **`xp-renewal-helpers.ts`** - XP renewal cost calculation, service fee, validation

### Supabase Utilities (`lib/supabase/`)
- **`client.ts`** - Supabase client configuration
- **`current-schema-check.ts`** - Current schema validation
- **`index.ts`** - Supabase utilities exports
- **`server.ts`** - Server-side Supabase client (`createAdminClient()`)
- **`types-gen-repaired.ts`** - Repaired generated types
- **`types-gen.ts`** - Generated type definitions
- **`types.ts`** - Application type definitions

### Services (`lib/services/`)
- **`enrollment-service.ts`** - User enrollment service management
- **`status-sync-service.ts`** - Status synchronization service
- **`user-key-service.ts`** - `hasValidKey()`, `grantKeyToUser()` — key ownership and granting

### API Utilities (`lib/api/`)
- **`parsers/`** - API response parsers
  - `admin-task-details.ts` - Admin task details parser with typed IncludeFlags

### Configuration (`lib/app-config/`)
- **`admin.ts`** - Centralized admin config constants (session TTL, page size, cache tags, rate limits)

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
- **`user/enrollments.ts`** - User enrollments
- **`user/cohort/[cohortId]/milestones.ts`** - User cohort milestones
- **`user/enrollment/[enrollmentId]/remove.ts`** - Enrollment removal
- **`user/task/[taskId]/claim.ts`** - Task reward claiming (gasless attestation)
- **`user/task/[taskId]/submit.ts`** - Task submission with proof/evidence
- **`user/task/[taskId]/upload.ts`** - Task proof image upload to Supabase Storage
- **`user/telegram/activate.ts`** - Links Telegram account to user profile

#### Application Endpoints
- **`applications.ts`** - Application submission (POST)
- **`applications/[id].ts`** - Individual application management (GET, DELETE)

#### Bootcamp Endpoints
- **`bootcamps.ts`** - Bootcamp listing (GET)
- **`bootcamps/[id].ts`** - Individual bootcamp operations

#### Quest Endpoints
- **`quests/index.ts`** - Quest management
- **`quests/[id].ts`** - Individual quest operations
- **`quests/[id]/start.ts`** - Quest start
- **`quests/user-progress.ts`** - User quest progress tracking
- **`quests/check-tos.ts`** - Terms of service checking
- **`quests/complete-quest.ts`** - Quest completion + key claim
- **`quests/claim-task-reward.ts`** - Task reward claiming (XP)
- **`quests/complete-task.ts`** - Task completion with verification
- **`quests/sign-tos.ts`** - Terms of service signing

#### Daily Quest Endpoints
- **`daily-quests/index.ts`** - GET eligible runs / POST start a run
- **`daily-quests/[runId].ts`** - GET run details with tasks
- **`daily-quests/[runId]/start.ts`** - POST start a specific daily run
- **`daily-quests/complete-task.ts`** - POST mark daily quest task complete
- **`daily-quests/complete-quest.ts`** - POST complete daily quest run
- **`daily-quests/claim-task-reward.ts`** - POST claim gasless EAS attestation reward
- **`daily-quests/commit-completion-attestation.ts`** - POST commit run completion attestation

#### Check-in Endpoints
- **`checkin/index.ts`** - POST daily checkin with streak update and delegated EAS attestation

#### Payment Endpoints
- **`payment/initialize.ts`** - Payment initialization
- **`payment/verify/[reference].ts`** - Payment verification
- **`payment/webhook.ts`** - Payment webhook handling
- **`payment/blockchain/initialize.ts`** - Blockchain payment initialization
- **`payment/blockchain/verify.ts`** - Blockchain payment verification
- **`payment/blockchain/status/[reference].ts`** - Blockchain payment status

#### Subscription Endpoints
- **`subscriptions/renew-with-xp.ts`** - POST atomic XP deduction + on-chain key extension
- **`subscriptions/xp-renewal-quote.ts`** - GET XP cost quote for renewal
- **`subscriptions/commit-renewal-attestation.ts`** - POST commits renewal EAS attestation

#### GoodDollar Endpoints
- **`gooddollar/verify-callback.ts`** - POST handles GoodDollar identity verification callback

#### AI Endpoints
- **`ai/kb/search.ts`** - POST semantic + keyword hybrid search against AI KB (Bearer secret auth)

#### Marketing Endpoints
- **`leads.ts`** - POST captures marketing leads and sends starter kit email

#### Milestone Endpoints
- **`milestones/claim.ts`** - POST claims milestone task reward (key grant + gasless attestation)

#### Admin Pages API Routes (`pages/api/admin/`)
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
- **`quests/[id]/can-delete.ts`** - GET checks if quest can be safely deleted
- **`quests/submissions.ts`** - Quest submissions management
- **`reconcile-key-grants.ts`** - Key grant reconciliation
- **`recover-lock-deployment.ts`** - Lock deployment recovery
- **`server-wallet.ts`** - Server wallet management
- **`session-fallback.ts`** - Admin session fallback (dev/fallback)

#### Webhook Endpoints
- **`webhooks/telegram.ts`** - POST Telegram bot webhook with secret header auth

#### System Endpoints
- **`health.ts`** - Health check endpoint
- **`verify.ts`** - General verification endpoint
- **`security/csp-report.ts`** - POST CSP violation reports with rate limiting

#### Debug Endpoints
- **`debug/admin-auth-user.ts`** - Admin authentication debugging
- **`debug/user-profile.ts`** - User profile debugging

#### Blockchain Endpoints
- **`ethereum/personal_sign.ts`** - Ethereum message signing
- **`solana/sign_message.ts`** - Solana message signing

### App API (`app/api/`)

#### Admin Session Management
- **`admin/session/route.ts`** - POST converts Privy JWT → admin session cookie with on-chain check
- **`admin/session/verify/route.ts`** - GET verifies admin session validity
- **`admin/logout/route.ts`** - POST clears admin session cookie

#### Admin Bootcamp Management
- **`admin/bootcamps/route.ts`** - Bootcamp CRUD (GET, POST, PUT, DELETE)
- **`admin/bootcamps/[id]/route.ts`** - Individual bootcamp management

#### Admin Cohort Management
- **`admin/cohorts/route.ts`** - Cohort CRUD (GET, POST, PUT, DELETE)
- **`admin/cohorts/[cohortId]/route.ts`** - Individual cohort management
- **`admin/cohorts/[cohortId]/applications/route.ts`** - Cohort applications

#### Admin Task & Milestone Management
- **`admin/milestones/route.ts`** - Milestone CRUD with cache invalidation
- **`admin/milestone-tasks/route.ts`** - Milestone task mutations (POST, PUT, DELETE; bulk create)
- **`admin/task-submissions/route.ts`** - Task submission management (GET, POST, PUT)
- **`admin/tasks/details/route.ts`** - Bundled task details with `include` param
- **`admin/tasks/by-milestone/route.ts`** - Tasks by milestone

#### Admin Quest Management
- **`admin/quests-v2/route.ts`** - GET/POST quests (App Router with cache tags)
- **`admin/quests-v2/[questId]/route.ts`** - PUT/DELETE individual quest

#### Admin Daily Quest Management
- **`admin/daily-quests/route.ts`** - GET/POST/PUT daily quest templates with Telegram broadcast
- **`admin/daily-quests/[dailyQuestId]/route.ts`** - GET/PUT/DELETE individual daily quest

#### Admin EAS Schema Management
- **`admin/eas-schemas/route.ts`** - GET list / POST deploy + save schema
- **`admin/eas-schemas/[uid]/route.ts`** - GET details / PATCH metadata
- **`admin/eas-schemas/[uid]/redeploy/route.ts`** - POST deploy missing schema + update UID
- **`admin/eas-schemas/sync/route.ts`** - POST sync schemas from chain
- **`admin/eas-schemas/reconcile/route.ts`** - POST reconcile schema inconsistencies

#### Admin EAS Network Management
- **`admin/eas-networks/route.ts`** - GET all / POST create EAS network config
- **`admin/eas-networks/[name]/route.ts`** - PATCH update / DELETE remove

#### Admin EAS Schema Keys
- **`admin/eas-schema-keys/route.ts`** - GET list / POST create schema key mapping
- **`admin/eas-schema-keys/[key]/route.ts`** - DELETE schema key

#### Admin Configuration
- **`admin/config/withdrawal-limits/route.ts`** - GET/POST withdrawal limit config
- **`admin/config/withdrawal-limits/audit/route.ts`** - GET withdrawal limit change audit log
- **`admin/subscriptions/config/route.ts`** - GET/PUT subscription config

#### Admin Miscellaneous
- **`admin/wallet/balance/route.ts`** - GET server wallet DG and ETH balances
- **`admin/leads/route.ts`** - GET marketing leads with CSV export
- **`admin/csp-reports/route.ts`** - GET/DELETE CSP violation reports
- **`admin/bootcamp-completion/route.ts`** - GET/POST bootcamp completion management

#### Token & Withdrawal
- **`token/withdraw/route.ts`** - POST DG withdrawal with EIP-712 verification + on-chain transfer
- **`token/withdraw/history/route.ts`** - GET paginated withdrawal history
- **`token/withdraw/commit-attestation/route.ts`** - POST commits withdrawal EAS attestation

#### Public Configuration
- **`config/withdrawal-limits/route.ts`** - GET public withdrawal limits (no auth)

#### User
- **`user/experience-points/route.ts`** - GET current user's XP balance
- **`user/bootcamp/[cohortId]/completion-status/route.ts`** - GET completion and certificate status
- **`user/bootcamp/[cohortId]/certificate-preview/route.ts`** - GET certificate preview data

#### Certificate
- **`certificate/save-url/route.ts`** - POST saves generated certificate image URL

#### Webhooks
- **`webhooks/meta/whatsapp/route.ts`** - POST Meta WhatsApp webhook with HMAC verification
- **`webhooks/meta/whatsapp/health/route.ts`** - GET webhook gateway health check

---

## Pages & Routes

### Next.js App Configuration
- **`_app.tsx`** - Next.js app configuration with Privy provider and global styles
- **`_document.tsx`** - Next.js document configuration for HTML structure

### Public Pages
- **`index.tsx`** - Homepage with hero, features, services, and bootcamp listings
- **`portal.tsx`** - Portal page with navigation and gateway interface
- **`privacy-policy.tsx`** - Full privacy policy (last updated February 2026)
- **`gooddollar-verification.tsx`** - GoodDollar face verification landing page
- **`gooddollar/verification.tsx`** - GoodDollar verification alias
- **`gooddollar/verify-callback.tsx`** - GoodDollar verification redirect callback

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
- **`quests/index.tsx`** - Quest listing with tabs (standard + daily)
- **`quests/[id].tsx`** - Individual quest details and progress
- **`quests/daily/index.tsx`** - Redirect to `/lobby/quests?tab=daily`
- **`quests/daily/[runId].tsx`** - Active daily quest run page with task list and stepper
- **`unlock-demo.tsx`** - Unlock protocol demonstration

### Admin Pages (`pages/admin/`)

#### Admin Dashboard & Management
- **`index.tsx`** - Main admin dashboard with module navigation
- **`blockchain.tsx`** - Blockchain tools and management
- **`draft-recovery.tsx`** - Draft recovery and data restoration
- **`unlock-demo.tsx`** - Unlock protocol demonstration for admins
- **`eas-schemas.tsx`** - EAS Schema Manager with tabs: List, Deploy, Sync, Config
- **`csp-reports.tsx`** - Admin CSP violation report viewer
- **`leads.tsx`** - Marketing leads management with CSV export
- **`dg-pullouts.tsx`** - DG token withdrawal limits configuration

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
- **`quests/daily/new.tsx`** - Create new daily quest template
- **`quests/daily/[dailyQuestId]/edit.tsx`** - Edit daily quest template

#### Payment Management
- **`payments/index.tsx`** - Payment transactions management

---

## Database & Supabase

### Supabase Configuration (`supabase/`)
- **`config.toml`** - Supabase project configuration with API, database, realtime, and studio settings
- **`package.json`** - Supabase utilities package with migration scripts
- **`run_migrations.js`** - Migration runner with environment validation and error handling

### Database Schema

#### Core Tables
- **`user_profiles`** - User profile information, XP balance, and metadata
- **`applications`** - Bootcamp applications with payment tracking
- **`user_application_status`** - Application status tracking and reconciliation
- **`bootcamp_programs`** - Bootcamp program definitions with images and rewards
- **`cohorts`** - Bootcamp cohorts with participant tracking
- **`bootcamp_enrollments`** - User enrollments and enrollment status
- **`user_activities`** - User activity logging and audit trail
- **`user_journey_preferences`** - User journey and preference settings
- **`marketing_leads`** - Email/intent capture data with name field

#### Milestone & Task Tables
- **`milestones`** - Learning milestones with progress tracking
- **`milestone_tasks`** - Milestone-specific tasks with contract interactions and task types
- **`task_submissions`** - Task submissions with file uploads and reviews
- **`user_milestone_progress`** - User milestone progress tracking
- **`user_task_progress`** - User task progress and completion status
- **`bootcamp_completion_status`** - Cohort completion tracking with certificate

#### Quest Tables
- **`quests`** - Quest definitions with images, prerequisites, and trial activation
- **`quest_tasks`** - Individual quest tasks with verification methods, AI config JSONB, and GoodDollar requirements
- **`user_quest_progress`** - User quest progress and completion tracking
- **`user_task_completions`** - Task completion tracking with gasless attestation UIDs
- **`quest_verified_tx_hashes`** - Replay prevention for transaction-based task verification

#### Daily Quest Tables
- **`daily_quest_templates`** - Daily quest template definitions
- **`daily_quest_tasks`** - Daily quest task configuration with input labels/placeholders
- **`daily_quest_runs`** - Per-user daily quest runs
- **`daily_quest_run_tasks`** - Per-run task completion tracking
- **`daily_quest_notifications`** - Daily quest notification dispatch

#### Check-in & Streak Tables
- **`user_daily_checkins`** - Daily check-in records with streak tracking

#### Payment & Finance Tables
- **`payment_transactions`** - Payment records with blockchain data
- **`dg_token_withdrawals`** - User DG withdrawal records with EIP-712 signatures
- **`withdrawal_limits`** - Min/max withdrawal amount configuration
- **`subscription_renewals`** - Subscription renewal records

#### Attestation Tables
- **`attestations`** - On-chain attestations with EAS integration and network column
- **`attestation_schemas`** - Attestation schemas with network and category management
- **`eas_networks`** - Supported EVM networks with EAS scan URLs and enabled flag
- **`eas_schema_keys`** - Schema key to UID mappings per network
- **`admin_action_nonces`** - Replay prevention for signed admin actions

#### Identity & Security Tables
- **`face_verification_records`** - GoodDollar face verification records
- **`gooddollar_verified_wallet_map`** - Maps verified wallets to users (one-to-one)
- **`wallet_link_map`** - Cross-user wallet claim tracking
- **`csp_reports`** - Content Security Policy violation reports

#### Notification Tables
- **`notifications`** - User notifications with delivery tracking
- **`telegram_notifications`** - Telegram notification dispatch + `users.telegram_chat_id`
- **`email_events`** - Email send deduplication table
- **`email_send_queue`** - Email send queue

#### AI Knowledge Base Tables
- **`ai_kb_documents`** - Knowledge base documents with content hash, audience, domain tags
- **`ai_kb_chunks`** - Document chunks with pgvector embeddings (`vector(1536)`, HNSW index)
- **`ai_kb_ingestion_runs`** - Ingestion run tracking with stats JSONB

#### Blockchain Tables
- **`lock_registry`** - Unlock protocol lock registry and management
- **`program_highlights`** - Free-text highlight content per cohort
- **`program_requirements`** - Free-text requirement content per cohort

### Database Functions & RPCs

#### Payment & Enrollment
- **`handle_successful_payment()`** - Atomic payment processing with enrollment creation

#### Admin & Security
- **`is_admin()`** - Admin role checking
- **`exec_sql()`** - Admin SQL execution with security controls

#### User Management
- **`create_or_update_user_profile()`** - User profile management
- **`get_user_dashboard_data()`** - Dashboard data aggregation
- **`award_xp_to_user(user_id, amount)`** - XP awarding

#### Check-in
- **`perform_daily_checkin_tx()`** - Atomic daily checkin with streak update

#### Milestone & Quest
- **`reconcile_milestone_progress()`** - Milestone progress reconciliation
- **`sync_daily_quest_run_tasks_if_safe()`** - Atomic daily quest task sync with TOCTOU guard

#### Notifications
- **`notify_task_review_outcome()`** - Task review notification trigger
- **`notify_task_submission_review()`** - Submission review trigger function

#### Cohort Management
- **`update_cohort_participant_counts()`** - Cohort participant count management

#### AI Knowledge Base
- **`search_ai_kb_chunks()`** - Hybrid search RPC (full-text + semantic with 0.35/0.65 weighting)
- **`match_documents()`** - Simple semantic similarity search
- **`upsert_kb_document_with_chunks()`** - Atomic document + chunk upsert
- **`acquire_ingestion_lock()`** - Atomic concurrency guard with `FOR UPDATE SKIP LOCKED`
- **`get_distinct_embedding_models()`** - Verify helper: distinct models across chunks
- **`count_short_chunks()`** - Verify helper: count chunks below length threshold

#### EAS
- **`get_schema_uid_for_key(key, network)`** - Schema UID resolution helper

#### System
- **`sync_storage_policies()`** - Storage policy synchronization
- **`fix_orphaned_applications()`** - Orphaned application cleanup

### Edge Functions (`supabase/functions/`)
- **`verify-blockchain-payment/`** - Blockchain payment verification with RPC fallbacks

### Migrations (`supabase/migrations/`)
- **155 migration files** covering complete schema evolution from initial setup through AI Knowledge Base
- Key categories: Core Schema (000-010), Quest System (011-022), Payment System (023-035), Milestone System (037-047), Notification System (048-052), System Maintenance (053-062), Security Hardening (063-080), Bootcamp Completion (081-085), Token Withdrawal (086-087), EAS & Attestation (090-135), Daily Quests (151-154), AI Knowledge Base (155)

---

## Authentication & Security

### Privy Integration
- **Multi-wallet support** - Ethereum, social logins
- **Session management** - JWT-based authentication
- **User management** - Profile linking and management
- **Custom domain** - `privy.p2einferno.com`

### Admin Authentication
- **Two-tier system** - Session-based + blockchain verification
- **Admin session** - Short-lived JWT cookies (HS256, configurable TTL)
- **Blockchain verification** - On-chain admin key checking via Unlock Protocol
- **Session hijacking protection** - Wallet-session validation (`useLockManagerAdminAuth`)
- **Signed admin actions** - EIP-712 signatures for schema mutations with nonce replay prevention

### Identity Verification
- **GoodDollar** - Face verification for Sybil resistance
- **One-wallet-per-user** - `gooddollar_verified_wallet_map` + `wallet_link_map` constraints
- **Ownership validation** - Wallet must belong to current Privy user

### Security Features
- **CSP implementation** - Content Security Policy with violation reporting
- **Environment validation** - Configuration validation at startup
- **Error handling** - Structured error responses (`lib/auth/error-handler.ts`)
- **Rate limiting** - IP-based in-memory rate limiter (`lib/utils/rate-limiter.ts`)
- **Input validation** - Request validation with Zod schemas
- **Database function security** - All PL/pgSQL functions use `SET search_path = 'public'`
- **Webhook verification** - Meta HMAC signature verification for WhatsApp gateway

---

## Blockchain Integration

### Unlock Protocol
- **Lock management** - Deploy and manage locks (admin + user locks)
- **Key operations** - Purchase, grant, and manage keys
- **Payment verification** - On-chain payment verification
- **Admin functions** - Lock manager operations, max-keys security, transferability control
- **Key Manager Contexts** - payment, milestone, admin_grant, reconciliation (`getKeyManagersForContext()`)

### Ethereum Attestation Service (EAS)
- **Attestation creation** - On-chain and gasless delegated attestations
- **Schema management** - DB-backed schema registry with deploy, sync, reconcile
- **Network support** - Multi-network with `eas_networks` DB config
- **Schema keys** - Logical key → UID resolution (`resolveSchemaUID()`)
- **Gasless attestations** - EIP-712 delegated signatures for check-in, task rewards, certificates

### DG Token Ecosystem
- **DG Token Vendor** - Buy/sell DG tokens via on-chain vendor contract
- **Uniswap V3** - Swap integration on Base with quoting and Permit2
- **Token Withdrawal** - EIP-712 signed withdrawals with server-side transfer
- **XP Renewal** - Subscription renewal via XP deduction + key extension

### Blockchain Clients
- **Viem v2** - Primary blockchain client (`createPublicClientUnified`, `createPublicClientForNetwork`)
- **Ethers v6** - Legacy adapter via `ethers-adapter-client.ts`
- **Provider management** - Unified provider system with sequential fallback transport
- **Network support** - Base, Ethereum mainnet, Celo (GoodDollar), configurable via chain map
- **RPC fallback** - Sequential fallback with configurable stall/retry settings

---

## Configuration & Constants

### Constants (`constants/`)
- **`index.ts`** - Main constants export with PUBLIC_LOCK_CONTRACT configuration
- **`public_lock_abi.ts`** - Complete Unlock Protocol Public Lock ABI

### Static Content (`lib/content/`)
- **`about.ts`** - ABOUT_CONTENT: hero, mission, problem/solution, tracks, vision
- **`bootcamps.ts`** - BOOTCAMPS_CONTENT: tracks, upcoming bootcamps, FAQs
- **`how-it-works.ts`** - HOW_IT_WORKS_CONTENT: 5-step journey, value equation
- **`quests.ts`** - QUESTS_CONTENT: categories, rewards, quest packs
- **`services.ts`** - SERVICES_OVERVIEW + ALL_SERVICES: 6 services with deliverables

### Admin Configuration (`lib/app-config/admin.ts`)
- Session TTL, page size, cache tags, rate limits

### Environment Variables
- **Authentication**: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- **Database**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_SUPABASE_SERVICE_ROLE_KEY`
- **Blockchain**: `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`, `LOCK_MANAGER_PRIVATE_KEY`
- **Payments**: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
- **Admin**: `ADMIN_SESSION_ENABLED`, `ADMIN_SESSION_JWT_SECRET`, `ADMIN_SESSION_TTL_SECONDS`, `ADMIN_RPC_TIMEOUT_MS`, `ADMIN_MAX_PAGE_SIZE`, `ADMIN_RPC_WARMUP_DISABLED`
- **AI**: `OPENROUTER_API_KEY`, `OPENROUTER_EMBEDDING_MODEL`, `AI_KB_API_SECRET`
- **Email**: `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAILGUN_FROM`, `MAILGUN_API_URL`, `MAILGUN_TEST_MODE`
- **GoodDollar**: GoodDollar SDK env vars for identity verification
- **Telegram**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- **WhatsApp**: `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_FORWARD_DESTINATION_URL`
- **Logging**: `LOG_LEVEL` (server), `NEXT_PUBLIC_LOG_LEVEL` (client)

### Configuration Files
- **`next.config.js`** - Next.js 16 configuration with CSP headers
- **`tailwind.config.js`** - TailwindCSS configuration
- **`tsconfig.json`** - TypeScript configuration
- **`jest.config.ts`** - Jest testing configuration
- **`supabase/config.toml`** - Supabase configuration

---

## Testing & Development

### Test Structure (`__tests__/`)
- **`pages/api/`** - API endpoint tests
- **`unit/`** - Unit tests for components, hooks, and utilities
  - `app/` - App-specific tests
  - `components/` - Component tests
  - `contexts/` - Context provider tests
  - `hooks/` - Hook tests
  - `lib/` - Library tests
- **`scripts/ai-kb/`** - AI KB build pipeline tests (acquireIngestionLock, filterValidChunks, etc.)
- **`lib/ai/knowledge/`** - AI knowledge module tests (chunking, embeddings, retrieval, sources)
- **`integration/db/`** - Integration tests (require local Supabase)
  - `ai-kb-hybrid-search.test.ts` - Hybrid search ordering, NULL filter
  - `ai-kb-upsert-rpc.test.ts` - Atomic upsert with run tracking
  - `ai-kb-concurrency-guard.test.ts` - Concurrency lock behavior

### Test Configuration
- **Jest** - Testing framework
- **Testing Library** - React component testing
- **jsdom** - DOM environment for tests
- **Coverage reporting** - Collected from UI, lib, hooks

### Development Scripts
- **`npm run dev`** - Development server
- **`npm run dev -- --turbo`** - Turbopack (faster HMR)
- **`npm run build && npm start`** - Production build/run
- **`npm run lint`** - ESLint + Prettier + tsc --noEmit
- **`npm run format`** - Prettier format
- **`npm run test:coverage`** - Jest + coverage
- **`npm run test:e2e`** - Synpress/Playwright E2E tests
- **`npm run db:migrate`** - Apply Supabase migrations
- **`npm run db:types`** - Generate TypeScript types from local schema
- **`npm run db:types:remote`** - Generate types from remote schema
- **`npm run db:seed`** - Reset DB with migrations + seed data
- **`npm run test:ai-kb`** - AI KB unit tests
- **`npm run test:ai-kb:integration`** - AI KB integration tests (requires Supabase)

### Scripts (`scripts/`)
- **`scripts/ai-kb/build.ts`** - AI KB build pipeline: reads JSONL, chunks, embeds, upserts
- **`scripts/ai-kb/extract.ts`** - Validates MCP-exported JSONL files against source registry
- **`scripts/ai-kb/verify.ts`** - Health checks: model consistency, staleness, coverage, canary search
- **`scripts/monitoring/certificate-metrics.ts`** - Certificate issuance metrics
- **`scripts/setup-telegram-webhook.sh`** - Register Telegram bot webhook URL
- **`scripts/check-admin-guards.js`** - Verify all admin routes call ensureAdminOrRespond
- **`scripts/clean-build.sh`** - Full clean build
- **`scripts/clean-build-fast.sh`** - Fast clean build (.next only)

### Automation (`automation/`)
- **`automation/config/ai-kb-sources.json`** - AI KB source registry
- **`automation/data/ai-kb/`** - Raw JSONL data for AI KB ingestion
- **`automation/plans/`** - Implementation plans (historical)

---

## Documentation

### Operations Documentation
- **`docs/ai-knowledge-base-operations.md`** - AI KB pipeline operations guide
- **`docs/system/logging.md`** - Logging system guide (`getLogger`, env vars, transports)
- **`docs/system/retryable-error-ux.md`** - Error handling UX patterns
- **`docs/system/email-notifications.md`** - Email event system (Mailgun, templates, dedup)
- **`docs/system/ethers-viem-adapter-implementation.md`** - Ethers/viem adapter architecture
- **`docs/system/whatsapp-webhook-gateway-implementation-plan.md`** - WhatsApp gateway implementation

### Integration Documentation
- **`docs/ai/OPENROUTER_AI_INTEGRATION.md`** - AI vision verification system
- **`docs/ai/AI_QUEST_REVIEW_AUTOMATION_FINDINGS.md`** - Task automation strategy and roadmap
- **`docs/guides/unlock-payment-guide.md`** - Unlock Protocol crypto payment integration
- **`docs/guides/paystack-transfers-integration-guide.md`** - Paystack fiat withdrawal integration
- **`docs/guides/unlock_crypto_purchase_guide.md`** - Crypto purchase flow

### Strategy Documentation
- **`docs/strategy/BUSINESS_SUMMARY.md`** - Business summary, mission, revenue models, brand narratives
- **`docs/strategy/INFERNAL_SPARKS_PRODUCTION_CONTENT.md`** - Full bootcamp curriculum (4 weeks, all milestones/tasks)
- **`docs/strategy/LOCKSMITH_QUEST_PRD.md`** - Locksmith Quest feature PRD

### Security Documentation
- **`docs/system/private-key-encryption.md`** - Private key encryption guidance (not yet implemented)
- **`docs/database-function-security-audit.md`** - Database function security audit results
- **`docs/supabase-security-performance-advisory.md`** - Security and performance advisory

### Archived Documentation
- **`docs/archived/`** - 23+ historical/superseded documents (plans, implementation notes, migration guides)

---

## Quick Reference

### Most Used Components
- **`components/ui/button.tsx`** - Button component
- **`components/ui/card.tsx`** - Card layout
- **`components/ui/network-error.tsx`** - Network error with retry
- **`components/layouts/MainLayout.tsx`** - Main layout
- **`components/layouts/lobby-layout.tsx`** - Lobby layout
- **`components/PrivyConnectButton.tsx`** - Authentication
- **`components/admin/AdminSessionGate.tsx`** - Admin session gate

### Most Used Hooks
- **`useAdminApi.ts`** - Admin API calls with auto-refresh
- **`useAdminFetchOnce.ts`** - Admin data fetching with TTL
- **`useAdminAuthContext`** - Admin authentication context
- **`useBootcamps.ts`** - Bootcamp data
- **`useUserEnrollments.ts`** - User enrollments
- **`useWalletBalances.ts`** - Wallet balances
- **`useDailyQuests.ts`** - Daily quest state
- **`useLockManagerClient.ts`** - On-chain key lookups

### Most Used Utilities
- **`lib/utils/logger`** - Logging system (`getLogger(module)`)
- **`lib/unlock/lockUtils.ts`** - Unlock operations
- **`lib/auth/privy.ts`** - Authentication helpers
- **`lib/supabase/client.ts`** - Database client
- **`lib/supabase/server.ts`** - Server database client (`createAdminClient()`)
- **`lib/helpers/key-manager-utils.ts`** - Key manager context helper
- **`lib/ai/knowledge/retrieval.ts`** - AI KB hybrid search

### Key API Endpoints
- **`/api/user/profile`** - User profile management
- **`/api/bootcamps`** - Bootcamp listing
- **`/api/applications`** - Application submission
- **`/api/admin/session`** - Admin session management
- **`/api/checkin`** - Daily check-in
- **`/api/daily-quests`** - Daily quest operations
- **`/api/ai/kb/search`** - AI knowledge base search

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
3. Include error handling and logging via `getLogger(module)`
4. Update this glossary with endpoint description

### Database Changes
1. Create migration in `supabase/migrations/` following `###_description.sql` pattern
2. All PL/pgSQL functions MUST include `SET search_path = 'public'`
3. Regenerate types: `npm run db:types`
4. Test migration locally: `supabase migration up --local`
5. Update this glossary with schema changes

---

*This glossary is maintained as a living document. Please update it when adding, modifying, or removing modules from the project.*
