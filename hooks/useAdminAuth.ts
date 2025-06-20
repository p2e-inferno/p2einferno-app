import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";


/**
 * Custom hook for admin authentication
 * @returns Object with isAdmin status, loading state, and user information
 */
export const useAdminAuth = () => {
  const { user, authenticated, ready } = usePrivy();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until Privy is ready and user data is loaded
    if (!ready) return;

    setLoading(true);
    
    if (!authenticated || !user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // For development, allow any authenticated user to be admin
    // In production, you should check against ADMIN_EMAILS or use a role-based system
    setIsAdmin(true);

    // To implement email-based admin check:
    // const userEmail = user.email?.address;
    // setIsAdmin(userEmail ? ADMIN_EMAILS.includes(userEmail) : false);

    setLoading(false);
  }, [user, authenticated, ready]);

  return { isAdmin, loading, user, authenticated };
}; 