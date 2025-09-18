# Admin Components: Convert Direct Fetch to useAdminApi

## Overview
Convert 8 admin components from direct `fetch` calls to `useAdminApi` hook, following established patterns to avoid infinite loops and ensure consistent authentication.

## Components to Convert

### 1. **TaskList.tsx** (HIGH PRIORITY)
**Issues**: Multiple fetch calls in useEffect, missing auth headers
**Pattern**: Convert to useAdminFetchOnce with parallel submission fetching
- Replace fetchTasks useEffect with useAdminFetchOnce pattern
- Convert submission fetching to use adminFetch with Promise.all
- Add stable dependencies with useMemo/useCallback

### 2. **MilestoneList.tsx** (HIGH PRIORITY)
**Issues**: Mixed usage - some adminFetch, some direct fetch in updateMilestoneOrder
**Pattern**: Convert remaining direct fetch calls to adminFetch
- Update updateMilestoneOrder function to use adminFetch
- Ensure consistent error handling across all operations

### 3. **ProgramHighlightsForm.tsx** (MEDIUM PRIORITY)
**Issues**: Manual token handling, missing error normalization
**Pattern**: Replace manual Privy auth with useAdminApi
- Convert fetchExistingHighlights to use adminFetch
- Remove manual getAccessToken usage
- Add useAdminFetchOnce for initial data loading

### 4. **ProgramRequirementsForm.tsx** (MEDIUM PRIORITY)
**Issues**: Similar to ProgramHighlightsForm
**Pattern**: Same as highlights form
- Convert existing fetch to adminFetch
- Remove manual auth handling
- Add proper error normalization

### 5. **QuestSubmissionsTable.tsx** (LOW PRIORITY)
**Issues**: Direct fetch for submissions data
**Pattern**: Convert to useAdminApi with proper pagination
- Replace direct fetch with adminFetch
- Maintain existing pagination logic
- Add consistent error handling

### 6. **TaskSubmissions.tsx** (LOW PRIORITY)
**Issues**: Direct fetch without proper auth headers
**Pattern**: Simple adminFetch conversion
- Convert submission fetching to adminFetch
- Add proper loading/error states

### 7. **KeyGrantReconciliation.tsx** (LOW PRIORITY)
**Issues**: Multiple direct fetch calls for reconciliation
**Pattern**: Convert to adminFetch with consistent error handling
- Update all reconciliation endpoints to use adminFetch
- Maintain existing reconciliation flow
- Add unified error normalization

### 8. **MilestoneForm.tsx** (LOW PRIORITY)
**Issues**: Direct fetch in form submission
**Pattern**: Simple adminFetch conversion
- Convert API call to use adminFetch
- Ensure consistent with other form patterns

## Key Patterns to Follow

### useAdminFetchOnce Pattern:
```typescript
const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
const { adminFetch, loading } = useAdminApi(apiOptions);
const fetchData = useCallback(async () => {
  // fetch logic with adminFetch
}, [adminFetch]);

useAdminFetchOnce({
  authenticated,
  isAdmin,
  walletKey: user?.wallet?.address || null,
  fetcher: fetchData,
});
```

### Stable Dependencies:
- Use `useMemo` for API options
- Use `useCallback` for fetch functions
- Pass minimal, stable keys to useAdminFetchOnce

### Error Handling:
- Remove manual error handling
- Let useAdminApi handle auth errors and retries
- Use consistent error normalization from error-utils

## Implementation Order
1. TaskList.tsx - Most complex, establishes pattern
2. MilestoneList.tsx - Mixed usage needs careful conversion
3. ProgramHighlightsForm.tsx & ProgramRequirementsForm.tsx - Similar patterns
4. Remaining components - Simpler conversions

## Testing Focus
- Verify no infinite loops in useEffect dependencies
- Confirm auth headers and session refresh work correctly
- Ensure error messages display consistently
- Test loading states integration

## Components Analysis

### Current Direct Fetch Usage:
```
TaskList.tsx:47 - fetch('/api/admin/tasks/by-milestone?milestone_id=${milestoneId}')
TaskList.tsx:67 - fetch('/api/admin/task-submissions?taskId=${task.id}')
QuestSubmissionsTable.tsx:86 - fetch submission endpoints
QuestSubmissionsTable.tsx:138 - fetch('/api/admin/quests/submissions')
ProgramHighlightsForm.tsx:47 - fetch('/api/admin/program-highlights?cohortId=${cohortId}')
ProgramHighlightsForm.tsx:131 - fetch('/api/admin/program-highlights')
ProgramRequirementsForm.tsx:47 - fetch requirements endpoint
ProgramRequirementsForm.tsx:133 - fetch('/api/admin/program-requirements')
MilestoneList.tsx:108 - fetch('/api/admin/milestones') [PUT]
MilestoneList.tsx:123 - fetch('/api/admin/milestones') [PUT]
MilestoneList.tsx:162 - fetch milestone endpoint
TaskSubmissions.tsx:158 - fetch('/api/admin/task-submissions')
KeyGrantReconciliation.tsx:63 - fetch('/api/admin/reconcile-key-grants')
KeyGrantReconciliation.tsx:98 - fetch('/api/admin/reconcile-key-grants')
KeyGrantReconciliation.tsx:143 - fetch('/api/admin/reconcile-key-grants')
MilestoneForm.tsx:109 - fetch(apiUrl)
```

### Existing Good Patterns:
- `pages/admin/cohorts/index.tsx` - Uses useAdminApi + useAdminFetchOnce properly
- `hooks/useAdminApi.ts` - Centralized auth and error handling
- `hooks/useAdminFetchOnce.ts` - Prevents infinite loops, auth-aware fetching

### Authentication Issues Found:
- Missing X-Active-Wallet headers
- Manual token handling instead of useAdminApi
- Inconsistent error handling
- No auto-retry on 401 errors
- Direct credentials management