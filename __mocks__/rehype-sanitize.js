// Mock for rehype-sanitize
module.exports = function rehypeSanitize() {
  return function (tree) {
    return tree;
  };
};
module.exports.default = module.exports;
