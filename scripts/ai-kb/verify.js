// @ts-nocheck
require("./register-ts-runtime");
const { main } = require("./ts/verify");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
