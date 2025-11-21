import { User } from '@privy-io/react-auth';
import { resolveBlockchainIdentity } from '@/lib/blockchain/services/identity-resolver';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:get-display-name');

/**
 * Extract display name from Privy user object for face verification UI
 * Priority: ENS name > Telegram first name > Email local part > Shortened address > "User"
 *
 * This is used for UI personalization in the face verification flow.
 * The exact usage is not documented by GoodDollar, but it likely appears as
 * a greeting or welcome message during verification.
 *
 * @param user - Privy user object
 * @returns Display name string
 */
export async function getDisplayName(user: User | null): Promise<string> {
  if (!user) {
    log.debug('No Privy user provided, returning default');
    return 'User';
  }

  try {
    // 1. Try to get ENS/Basename name (async - requires RPC call)
    const primaryWallet = user.linkedAccounts.find(
      (acc) => acc.type === 'wallet',
    );
    if (primaryWallet && primaryWallet.type === 'wallet') {
      try {
        const identity = await resolveBlockchainIdentity(
          primaryWallet.address,
        );
        if (identity.displayName) {
          log.debug('Using blockchain identity', {
            displayName: identity.displayName,
            source: identity.basename ? 'basename' : 'ens',
          });
          return identity.displayName;
        }
      } catch (error) {
        log.debug('Blockchain identity resolution failed', { error });
      }
    }

    // 2. Try Telegram first name
    const telegramAccount = user.linkedAccounts.find(
      (acc) => acc.type === 'telegram',
    );
    if (telegramAccount && telegramAccount.type === 'telegram') {
      if (telegramAccount.firstName) {
        log.debug('Using Telegram name', {
          displayName: telegramAccount.firstName,
        });
        return telegramAccount.firstName;
      }
    }

    // 3. Try email local part
    if (user.email?.address) {
      const [emailLocal] = user.email.address.split('@');
      if (emailLocal) {
        // Convert underscores/dots to spaces and capitalize
        const displayEmail = emailLocal
          .replace(/[._]/g, ' ')
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (displayEmail) {
          log.debug('Using email display name', { displayName: displayEmail });
          return displayEmail;
        }
      }
    }

    // 4. Fallback to shortened wallet address
    if (primaryWallet && primaryWallet.type === 'wallet') {
      const shortened = `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`;
      log.debug('Using shortened address', { displayName: shortened });
      return shortened;
    }

    // 5. Ultimate fallback
    log.debug('Using default display name');
    return 'User';
  } catch (error) {
    log.error('Error getting display name', { error });
    return 'User';
  }
}

/**
 * Synchronous version without ENS/Basename resolution
 * Use this for immediate UI responses (button clicks, form submissions)
 *
 * @param user - Privy user object
 * @returns Display name string (no network calls)
 */
export function getDisplayNameSync(user: User | null): string {
  if (!user) {
    return 'User';
  }

  try {
    // 1. Try Telegram first name
    const telegramAccount = user.linkedAccounts.find(
      (acc) => acc.type === 'telegram',
    );
    if (telegramAccount && telegramAccount.type === 'telegram') {
      if (telegramAccount.firstName) {
        return telegramAccount.firstName;
      }
    }

    // 2. Try email local part
    if (user.email?.address) {
      const [emailLocal] = user.email.address.split('@');
      if (emailLocal) {
        const displayEmail = emailLocal
          .replace(/[._]/g, ' ')
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (displayEmail) {
          return displayEmail;
        }
      }
    }

    // 3. Fallback to shortened wallet address
    const primaryWallet = user.linkedAccounts.find(
      (acc) => acc.type === 'wallet',
    );
    if (primaryWallet && primaryWallet.type === 'wallet') {
      return `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`;
    }

    return 'User';
  } catch (error) {
    log.error('Error in getDisplayNameSync', { error });
    return 'User';
  }
}
