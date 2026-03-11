require("./register-ts-runtime");
const { main } = require("./ts/build.ts");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
