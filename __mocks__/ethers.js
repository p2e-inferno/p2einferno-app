// @ts-nocheck
// Minimal ethers mock for Jest tests
// Provides only the APIs our test imports touch indirectly

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

module.exports = {
  ethers: {
    Interface: InterfaceMock,
  },
};
