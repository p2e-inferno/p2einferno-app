// @ts-nocheck
// Comprehensive ethers mock for Jest tests
// Provides APIs for EAS SDK and attestation system compatibility

class InterfaceMock {
  constructor(abi) {
    this.abi = abi;
  }
  // parseLog tries to decode a log; in tests we don't rely on its output,
  // so default to throwing to indicate non-matching log.
  parseLog() {
    throw new Error('ethers.Interface.parseLog mock: not a matching event');
  }
}

class BrowserProviderMock {
  constructor(provider) {
    this.provider = provider;
  }
  
  async getSigner() {
    return {
      getAddress: () => '0x1234567890123456789012345678901234567890',
      signMessage: (message) => `signed:${message}`,
      signTransaction: (tx) => `signed:${JSON.stringify(tx)}`,
    };
  }
}

class ContractMock {
  constructor(address, abi, signer) {
    this.address = address;
    this.abi = abi;
    this.signer = signer;
  }
  
  async revoke(request) {
    return {
      hash: '0xrevokehash',
      wait: async () => ({
        status: 1,
        transactionHash: '0xrevokehash',
      }),
    };
  }
  
  async attest(request) {
    return {
      hash: '0xattesthash',
      wait: async () => ({
        status: 1,
        transactionHash: '0xattesthash',
      }),
    };
  }
}

class AbiCoderMock {
  encode(types, values) {
    // Return a mock encoded string based on the inputs
    return `0x${types.join('')}${values.map(v => String(v)).join('')}`;
  }
  
  decode(types, data) {
    // Simulate real AbiCoder behavior - throw on invalid data
    if (!data || !data.startsWith('0x')) {
      throw new Error('Invalid encoded data format');
    }
    
    // Return mock decoded values based on types
    return types.map((type, index) => {
      if (type === 'address') return '0x1234567890123456789012345678901234567890';
      if (type.startsWith('uint')) return BigInt(42);
      if (type === 'bool') return true;
      if (type === 'string') return `value${index}`;
      if (type.startsWith('bytes')) return '0xdeadbeef';
      return `mockvalue${index}`;
    });
  }
}

const abiCoderInstance = new AbiCoderMock();

module.exports = {
  ethers: {
    Interface: InterfaceMock,
    BrowserProvider: BrowserProviderMock,
    Contract: ContractMock,
    AbiCoder: {
      defaultAbiCoder: () => abiCoderInstance,
    },
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    isAddress: (address) => {
      return typeof address === 'string' && 
             address.startsWith('0x') && 
             address.length === 42;
    },
  },
  // Also export as named export for different import patterns
  isAddress: (address) => {
    return typeof address === 'string' && 
           address.startsWith('0x') && 
           address.length === 42;
  },
};
