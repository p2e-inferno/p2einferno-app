/**
 * Admin Authentication Provider Component
 * 
 * Refactored provider component that uses the modular hook system.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import React, { createContext, useContext } from 'react';
import { useAdminAuthContextInternal } from './hooks/useAdminAuthContextInternal';
import type { AdminAuthContextValue, AdminAuthProviderProps } from './types/AdminAuthContextTypes';

// ================================
// CONTEXT CREATION
// ================================

/**
 * Admin Authentication Context
 *
 * Provides centralized admin authentication state management to eliminate
 * duplicate RPC calls and provide consistent auth state across components.
 */
const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

// ================================
// PROVIDER COMPONENT
// ================================

/**
 * AdminAuthProvider - Centralized admin authentication state management
 *
 * This context provider eliminates duplicate RPC calls by providing a single
 * source of truth for admin authentication state across all admin components.
 *
 * Benefits:
 * - Single RPC call per auth check (instead of one per component)
 * - Shared state across all admin components
 * - Automatic cleanup and throttling
 * - Consistent behavior across the app
 * - Performance optimization with smart caching
 */
export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
  const contextValue = useAdminAuthContextInternal();

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
};

// ================================
// CONSUMER HOOK
// ================================

/**
 * Custom hook to consume admin auth context
 *
 * This replaces the need for individual components to call useLockManagerAdminAuth
 *
 * @throws Error if used outside of AdminAuthProvider
 * @returns AdminAuthContextValue with all auth state and methods
 */
export const useAdminAuthContext = (): AdminAuthContextValue => {
  const context = useContext(AdminAuthContext);

  if (context === undefined) {
    throw new Error(
      'useAdminAuthContext must be used within an AdminAuthProvider. ' +
      'Make sure to wrap your admin components with <AdminAuthProvider>.'
    );
  }

  return context;
};
