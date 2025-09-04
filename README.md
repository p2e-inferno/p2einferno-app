# P2E Inferno - Web3 Gamified Education Platform

A comprehensive Play-to-Earn (P2E) gamified education platform for Web3/blockchain learning. Built with Next.js, Privy authentication, Supabase database, and integrated blockchain functionality via Unlock Protocol.

## 🏗️ Architecture Overview

This application implements a sophisticated **three-layer authentication architecture** designed for security, performance, and scalability across frontend, backend, and blockchain environments.

### Key Features

- 🎓 **Gamified Learning**: Quest-based education system with XP and rewards
- 🔐 **Multi-Layer Authentication**: Frontend, backend, and blockchain authentication
- 💰 **Blockchain Integration**: Payment verification, token-gating via Unlock Protocol  
- ⚡ **Performance Optimized**: Parallel processing, bundle optimization, caching
- 🛡️ **Security First**: Proper environment boundaries, structured error handling
- 📱 **Responsive Design**: Dark theme, mobile-optimized UI

For detailed architectural information, see [Authentication Architecture Documentation](./docs/AUTHENTICATION_ARCHITECTURE.md).

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Privy account and app configuration
- Alchemy API key for blockchain operations

### Installation

1. **Clone and install dependencies**:
```bash
git clone <repository-url>
cd p2einferno-app
npm install
```

2. **Environment Setup**:
```bash
cp .env.example .env.local
```

3. **Configure environment variables** in `.env.local`:

```bash
# Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PRIVY_APP_SECRET=your_privy_app_secret
PRIVY_VERIFICATION_KEY="-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----"

# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Blockchain Configuration
NEXT_PUBLIC_BLOCKCHAIN_NETWORK=base-sepolia
NEXT_PUBLIC_ADMIN_LOCK_ADDRESS=0x...
LOCK_MANAGER_PRIVATE_KEY=0x...
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key
NEXT_PUBLIC_BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/

# Development
DEV_ADMIN_ADDRESSES=0x... # Comma-separated admin addresses for development

# Admin Session & API tuning (optional)
# Short‑lived admin session TTL (seconds)
ADMIN_SESSION_TTL_SECONDS=60
# RPC timeout for admin on‑chain checks (ms)
ADMIN_RPC_TIMEOUT_MS=10000
# Maximum page size for admin list endpoints
ADMIN_MAX_PAGE_SIZE=200
# Enable admin session middleware (default false to avoid breaking changes)
ADMIN_SESSION_ENABLED=false
# Secret used to sign admin session JWTs (HS256). Set to a strong random value in production.
ADMIN_SESSION_JWT_SECRET=replace-with-a-long-random-secret
# Admin session issuance rate limit (per minute)
ADMIN_SESSION_RATE_LIMIT_PER_MINUTE=30
```

4. **Database Setup**:
```bash
npm run db:migrate  # Set up Supabase tables and RLS policies
```

5. **Start Development Server**:
```bash
npm run dev
```

Visit http://localhost:3000 to see your application!

## 🎯 Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production  
npm run start        # Start production server
npm run lint         # Run ESLint, Prettier, and TypeScript checks
npm run format       # Format code with Prettier
npm run db:migrate   # Run database migrations
```

## 📚 Architecture Deep Dive

### Multi-Layer Authentication System

Our authentication architecture operates across three distinct layers:

#### 1. **Frontend Layer** (`lib/blockchain/frontend-config.ts`)
- Bundle-optimized configuration with hardcoded values
- Browser-based wallet interactions via Privy React hooks  
- Security boundary: No access to private keys or server-only variables

#### 2. **Backend Layer** (`lib/auth/` directory)
- Server-side JWT verification with Privy API fallback
- Admin authentication via parallel blockchain key checking
- Full environment variable access for secure operations

#### 3. **Blockchain Layer** (`lib/blockchain/` directory)  
- On-chain validation via Unlock Protocol
- Payment verification through Supabase Edge Functions
- Smart contract interactions on Base network

### Key Files

- **`lib/auth/admin-auth.ts`**: Blockchain-only admin authentication middleware
- **`lib/auth/config-validation.ts`**: Startup configuration validation  
- **`lib/blockchain/config/unified-config.ts`**: Centralized blockchain configuration
- **`lib/auth/error-handler.ts`**: Structured error handling system

### Performance Features

- ✅ **Parallel Wallet Checking**: 3x faster admin authentication  
- ✅ **JWT Fallback**: Local verification when Privy API is unavailable
- ✅ **Bundle Optimization**: Minimal client-side footprint
- ✅ **Configuration Validation**: Prevents silent failures at startup

## Database Setup

### Supabase

This project uses Supabase as its database. Follow these steps to set up the database:

1. Make sure your environment variables are set in a `.env` file:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
   ```

2. Install the required packages if they're not already installed:

   ```
   npm install dotenv
   ```

3. Run the migrations to create all necessary tables:
   ```
   npm run db:migrate
   ```

This will create all necessary tables in your Supabase database, including:

- User profiles
- Applications
- Enrollments
- Quests
- Activities

### Database Structure

The database contains the following main tables:

- `user_profiles`: Stores user information
- `applications`: Bootcamp applications
- `user_application_status`: Links users to their applications
- `bootcamp_enrollments`: User enrollments in bootcamps
- `user_activities`: User activity tracking
- `quests` and `quest_tasks`: Quest system

The database also includes views for easier data access:

- `user_applications_view`: Combines user_application_status with applications
- `user_enrollments_view`: Combines bootcamp_enrollments with cohorts
