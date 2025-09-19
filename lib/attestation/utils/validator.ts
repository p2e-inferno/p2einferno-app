/**
 * Validation utilities for attestations
 */

import { ethers } from 'ethers';

/**
 * Validate Ethereum address format
 */
export const isValidAddress = (address: string): boolean => {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
};

/**
 * Validate schema definition format
 */
export const isValidSchemaDefinition = (definition: string): boolean => {
  try {
    // Check if definition has proper format: "type name,type name,..."
    const fields = definition.split(',').map(field => field.trim());
    
    for (const field of fields) {
      const parts = field.split(' ');
      if (parts.length !== 2) {
        return false;
      }
      
      const [type, name] = parts;
      if (!type || !name) {
        return false;
      }

      // Validate type format
      if (!isValidSolidityType(type)) {
        return false;
      }

      // Validate name format (basic identifier check)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate Solidity type format
 */
export const isValidSolidityType = (type: string): boolean => {
  const validTypes = [
    // Basic types
    'address', 'bool', 'string', 'bytes',
    // Uint types
    'uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256',
    // Int types
    'int8', 'int16', 'int32', 'int64', 'int128', 'int256',
    // Fixed bytes
    'bytes1', 'bytes2', 'bytes4', 'bytes8', 'bytes16', 'bytes32',
  ];
  
  // Check exact match for basic types
  if (validTypes.includes(type)) {
    return true;
  }
  
  // Check for array types
  if (type.endsWith('[]')) {
    const baseType = type.slice(0, -2);
    return isValidSolidityType(baseType);
  }
  
  // Check for fixed array types
  const fixedArrayMatch = type.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch && fixedArrayMatch[1]) {
    const baseType = fixedArrayMatch[1];
    return isValidSolidityType(baseType);
  }
  
  return false;
};

/**
 * Validate attestation data against schema
 */
export const validateAttestationData = (
  schemaDefinition: string,
  data: Record<string, any>
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    const fields = schemaDefinition.split(',').map(field => field.trim());
    
    for (const field of fields) {
      const parts = field.split(' ');
      if (parts.length !== 2) continue;

      const [type, name] = parts;
      if (!type || !name) continue;

      const value = data[name];
      
      // Check if required field is present (we consider all fields required for now)
      if (value === undefined || value === null) {
        // Allow optional fields for certain types
        continue;
      }
      
      // Type-specific validation
      switch (type) {
        case 'address':
          if (typeof value !== 'string' || !isValidAddress(value)) {
            errors.push(`Invalid address for field ${name}: ${value}`);
          }
          break;
          
        case 'bool':
          if (typeof value !== 'boolean') {
            errors.push(`Invalid boolean for field ${name}: ${value}`);
          }
          break;
          
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Invalid string for field ${name}: ${value}`);
          }
          break;
          
        default:
          if (type.startsWith('uint')) {
            if (typeof value !== 'number' && typeof value !== 'bigint') {
              errors.push(`Invalid uint for field ${name}: ${value}`);
            } else if (typeof value === 'number' && (value < 0 || !Number.isInteger(value))) {
              errors.push(`Invalid uint for field ${name}: must be a positive integer`);
            }
          }
          break;
      }
    }
  } catch (error) {
    errors.push(`Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate wallet connection
 */
export const validateWalletConnection = (wallet: any): { valid: boolean; error?: string } => {
  if (!wallet) {
    return { valid: false, error: 'No wallet connected' };
  }
  
  if (!wallet.address || !isValidAddress(wallet.address)) {
    return { valid: false, error: 'Invalid wallet address' };
  }
  
  if (typeof wallet.getEthereumProvider !== 'function') {
    return { valid: false, error: 'Wallet does not support Ethereum provider' };
  }
  
  return { valid: true };
};
