/**
 * Authentication Configuration Validation
 * Purpose: Prevent silent failures by validating auth configuration at startup
 * Runtime: Server-side only (startup validation)
 */

interface AuthConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface RuntimeContext {
  type: 'browser' | 'server' | 'edge';
  isProduction: boolean;
  isDevelopment: boolean;
}

/**
 * Detect the current runtime environment
 */
export const getRuntimeContext = (): RuntimeContext => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (typeof window !== 'undefined') {
    return { type: 'browser', isProduction, isDevelopment };
  }
  
  if (typeof globalThis !== 'undefined' && 'Deno' in globalThis) {
    return { type: 'edge', isProduction, isDevelopment };
  }
  
  return { type: 'server', isProduction, isDevelopment };
};

/**
 * Validate authentication configuration based on runtime context
 * Prevents silent failures by failing fast on missing critical config
 */
export const validateAuthConfiguration = (): AuthConfigValidation => {
  const context = getRuntimeContext();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical environment variables required for all server-side auth
  const requiredServerEnvVars = [
    'NEXT_PUBLIC_PRIVY_APP_ID',
    'NEXT_PRIVY_APP_SECRET'
  ];

  // Optional but recommended for fallback scenarios
  const optionalServerEnvVars = [
    'PRIVY_VERIFICATION_KEY' // For JWT fallback when Privy API is unavailable
  ];

  // Admin-specific configuration
  const adminRequiredVars = [
    'NEXT_PUBLIC_ADMIN_LOCK_ADDRESS'
  ];

  const adminOptionalVars = [
    'DEV_ADMIN_ADDRESSES' // Development fallback
  ];

  if (context.type === 'server') {
    // Validate required server environment variables
    const missingRequired = requiredServerEnvVars.filter(key => !process.env[key]);
    const missingOptional = optionalServerEnvVars.filter(key => !process.env[key]);
    
    if (missingRequired.length > 0) {
      errors.push(
        `Missing required authentication environment variables: ${missingRequired.join(', ')}. ` +
        `Authentication will fail completely without these.`
      );
    }

    if (missingOptional.length > 0) {
      warnings.push(
        `Missing optional auth environment variables: ${missingOptional.join(', ')}. ` +
        `JWT fallback mechanisms may be limited during Privy API outages.`
      );
    }

    // Validate JWT verification key format if provided
    const jwtKey = process.env.PRIVY_VERIFICATION_KEY;
    if (jwtKey && !jwtKey.includes('BEGIN PUBLIC KEY')) {
      errors.push(
        'PRIVY_VERIFICATION_KEY must be in SPKI format with BEGIN/END PUBLIC KEY markers. ' +
        'Current format appears invalid for JWT verification.'
      );
    }

    // Validate admin configuration
    const missingAdminRequired = adminRequiredVars.filter(key => !process.env[key]);
    const missingAdminOptional = adminOptionalVars.filter(key => !process.env[key]);

    if (missingAdminRequired.length > 0) {
      if (context.isDevelopment) {
        warnings.push(
          `Missing admin config: ${missingAdminRequired.join(', ')}. ` +
          `Admin authentication may fall back to DEV_ADMIN_ADDRESSES in development.`
        );
      } else {
        errors.push(
          `Missing required admin configuration: ${missingAdminRequired.join(', ')}. ` +
          `Admin authentication will fail in production without these.`
        );
      }
    }

    if (context.isDevelopment && missingAdminOptional.length > 0) {
      warnings.push(
        `Development admin fallback not configured: ${missingAdminOptional.join(', ')}. ` +
        `Consider setting DEV_ADMIN_ADDRESSES for local development.`
      );
    }

    // Validate blockchain configuration
    const blockchainVars = ['LOCK_MANAGER_PRIVATE_KEY', 'NEXT_PUBLIC_ALCHEMY_API_KEY'];
    const missingBlockchain = blockchainVars.filter(key => !process.env[key]);
    
    if (missingBlockchain.length > 0) {
      warnings.push(
        `Missing blockchain configuration: ${missingBlockchain.join(', ')}. ` +
        `Some blockchain operations may be limited or use fallback endpoints.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validate configuration and log results
 * Call this at application startup to catch configuration issues early
 */
export const validateAndLogConfiguration = (): void => {
  const { getLogger } = require('@/lib/utils/logger');
  const log = getLogger('auth:config');
  const validation = validateAuthConfiguration();
  const context = getRuntimeContext();

  log.info(`Runtime: ${context.type}, Environment: ${process.env.NODE_ENV}`);

  if (validation.warnings.length > 0) {
    validation.warnings.forEach(warning => {
      log.warn(`${warning}`);
    });
  }

  if (validation.errors.length > 0) {
    validation.errors.forEach(error => {
      log.error(`${error}`);
    });
    
    if (!context.isDevelopment) {
      throw new Error(
        `Authentication configuration validation failed: ${validation.errors.length} critical errors found. ` +
        `Check environment variables and restart the application.`
      );
    } else {
      log.error(
        `Configuration errors found but continuing in development mode. ` +
        `These MUST be fixed before production deployment.`
      );
    }
  } else {
    log.info(`✅ Configuration validation passed`);
  }
};

/**
 * Check if specific authentication features are properly configured
 */
export const checkAuthFeatureAvailability = () => {
  return {
    privyAuth: !!(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.NEXT_PRIVY_APP_SECRET),
    jwtFallback: !!process.env.PRIVY_VERIFICATION_KEY,
    adminAuth: !!process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS,
    blockchainOps: !!process.env.LOCK_MANAGER_PRIVATE_KEY,
    enhancedRpc: !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
  };
};
