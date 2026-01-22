// Mock for rehype-sanitize
// @ts-nocheck
module.exports = function rehypeSanitize() {
  return function (tree) {
    return tree;
  };
};
module.exports.default = module.exports;
