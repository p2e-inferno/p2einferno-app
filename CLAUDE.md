# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Start development server on http://localhost:3000
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint, Prettier check, and TypeScript type checking
npm run format     # Format code with Prettier
```

## Architecture Overview

This is a Next.js application with Pages Router that implements a Play-to-Earn (P2E) gamified education platform for Web3/blockchain learning.

### Tech Stack
- **Frontend**: Next.js (Pages Router), TypeScript, React
- **Styling**: Tailwind CSS with custom dark theme
- **Authentication**: Privy (@privy-io/react-auth) for Web3 auth
- **Database**: Supabase (PostgreSQL with Row-Level Security)
- **State**: React hooks, no global state management library
- **HTTP**: Axios with custom API client setup
- **Token-gating**: Unlock Protocol for access control and token gating

### Key Patterns

1. **API Structure**: All API endpoints follow `/pages/api/[resource]/[action].ts` pattern with standardized `ApiResponse<T>` type:
   ```typescript
   type ApiResponse<T> = {
     success: boolean;
     data?: T;
     error?: string;
   }
   ```

2. **Database Access**: Use Supabase client from `lib/supabase/client.ts`. 

3. **Type System**: 
   - **Manual Types**: `lib/supabase/types.ts` - Business logic interfaces (BootcampProgram, Cohort, etc.)
   - **Auto-Generated Types**: `lib/supabase/types-gen.ts` - Complete database schema types from Supabase
   - **Regenerate database types**: `source .env.local && npx supabase gen types typescript --linked > lib/supabase/types-gen.ts`
   - **NEVER** create `types.ts` in project root - use the lib/supabase/ directory

4. **Authentication**: Privy wrapper prevents SSR issues. Check authentication state with Privy hooks.

5. **Component Organization**: 
   - UI components in `/components/ui/` follow shadcn/ui patterns
   - Feature components grouped by feature (e.g., `/components/quests/`)
   - Layout components in `/components/layouts/`

6. **Custom Hooks**: API calls use `useApiCall` hook for consistent error handling and loading states.

### Environment Variables
Required in `.env.local`:
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PRIVY_APP_SECRET` 
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Database Schema
Main tables include:
- `profiles`: User profiles with XP, levels, and Web3 identities
- `quests`: Gamified tasks with metadata
- `quest_tasks`: Individual tasks within quests
- `applications`: Bootcamp applications
- `enrollments`: Course enrollments
- `cohorts`: Bootcamp cohorts

All tables use Row-Level Security (RLS) policies for authorization.

## feature implementation and integrations
- Always begin new feature implementations and integrations by searching the codebase for existing hooks, helper functions, utilities, and components that can be reused to avoid duplication.
- Start by creating the relevant helper functions, hooks, utilities, and components before creating the feature, page, component or integration and use the components created to keep code modular.
- Prioritize modularity and composability to ensure code is manageable and easy to maintain.
- Use abstraction as much as possible to keep scripts, apis, components lean and clean.
- Follow best practices and industry standards when creating helpers, hooks, utilities and place then in the appropriate folders do not create random folders.