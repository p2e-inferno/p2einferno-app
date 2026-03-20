// @ts-nocheck
require("./register-ts-runtime");
const { main } = require("./ts/validate-kb-coverage");

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
