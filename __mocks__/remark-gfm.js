// Mock for remark-gfm
module.exports = function remarkGfm() {
  return function (tree) {
    return tree;
  };
};
module.exports.default = module.exports;
