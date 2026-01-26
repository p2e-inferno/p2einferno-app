// Mock for remark-gfm
// @ts-nocheck
module.exports = function remarkGfm() {
  return function (tree) {
    return tree;
  };
};
module.exports.default = module.exports;
