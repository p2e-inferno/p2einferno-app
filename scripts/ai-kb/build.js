// @ts-nocheck
require("./register-ts-runtime");
const { main } = require("./ts/build");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
