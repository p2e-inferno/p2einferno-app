// Global type declarations for the application

import type { EIP1193Provider } from "viem";

interface Window {
  ethereum?: EIP1193Provider & {
    isMetaMask?: boolean;
  };
}
