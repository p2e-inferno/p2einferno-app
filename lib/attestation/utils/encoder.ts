/**
 * Data encoding utilities for attestations
 */

import { ethers } from 'ethers';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('lib:attestation:encoder');

/**
 * Encode attestation data according to schema definition
 */
export const encodeAttestationData = (
  schemaDefinition: string,
  data: Record<string, any>
): string => {
  try {
    log.debug('Schema definition', { schemaDefinition });
    const fields = schemaDefinition.split(',').map(field => field.trim());
    log.debug('Parsed fields', { fields });
    
    const types: string[] = [];
    const values: any[] = [];

  fields.forEach((field, index) => {
    const parts = field.split(' ');
    if (parts.length !== 2) {
      throw new Error(`Invalid field format: ${field}`);
    }
    const [type, name] = parts as [string, string];
    types.push(type);
    log.debug('Processing field', { index, type, name });

    if (data[name] !== undefined) {
      // Handle different data types properly
      if (type.startsWith('uint') && typeof data[name] === 'number') {
        values.push(BigInt(data[name]));
        log.debug('Added field value', { name, value: BigInt(data[name]) });
      } else if (type === 'address' && typeof data[name] === 'string') {
        values.push(data[name]);
        log.debug('Added field value', { name, value: data[name] });
      } else {
        values.push(data[name]);
        log.debug('Added field value', { name, value: data[name] });
      }
    } else {
      // Provide appropriate defaults based on type
      if (type === 'address') {
        values.push(ethers.ZeroAddress);
        log.debug('Added default value', { name, value: ethers.ZeroAddress });
      } else if (type.startsWith('uint')) {
        values.push(BigInt(0));
        log.debug('Added default value', { name, value: BigInt(0) });
      } else {
        values.push('');
        log.debug('Added default value', { name, value: '' });
      }
    }
  });

    log.debug('Encoding data', { types, values });

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, values);
    log.debug('Encoded data result', { encoded, length: encoded.length });

    return encoded;
  } catch (error) {
    log.error('Error encoding attestation data', { error });
    throw new Error('Failed to encode attestation data: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

/**
 * Decode attestation data from bytes
 */
export const decodeAttestationData = (
  schemaDefinition: string,
  encodedData: string
): Record<string, any> => {
  try {
    const fields = schemaDefinition.split(',').map(field => field.trim());
    const types: string[] = [];
    const names: string[] = [];
    
    fields.forEach(field => {
      const parts = field.split(' ');
      if (parts.length !== 2) {
        throw new Error(`Invalid field format: ${field}`);
      }
      types.push(parts[0] as string);
      names.push(parts[1] as string);
    });

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(types, encodedData);
    
    const result: Record<string, any> = {};
    names.forEach((name, index) => {
      result[name] = decoded[index];
    });

    return result;
  } catch (error) {
    log.error('Error decoding attestation data', { error });
    throw new Error('Failed to decode attestation data: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};
