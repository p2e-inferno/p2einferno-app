/*
 * Deploys the canonical Bootcamp Completion schema to EAS.
 * Requires: RPC_URL, DEPLOYER_PRIVATE_KEY, EAS_CONTRACT_ADDRESS
 */
import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

async function deploySchema() {
  const rpcUrl = process.env.RPC_URL;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  const easAddress = process.env.EAS_CONTRACT_ADDRESS;
  if (!rpcUrl || !pk || !easAddress) {
    console.error("Missing RPC_URL, DEPLOYER_PRIVATE_KEY or EAS_CONTRACT_ADDRESS");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(pk, provider);
  const registry = new SchemaRegistry(easAddress);
  registry.connect(signer);

  const schema =
    "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash";

  const tx = await registry.register({
    schema,
    resolverAddress: ethers.ZeroAddress,
    revocable: false,
  });
  await tx.wait();
}

deploySchema().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
