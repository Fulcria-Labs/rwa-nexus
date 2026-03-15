import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export default async function globalSetup() {
  const rootDir = path.resolve(__dirname, "../..");
  const typechainDir = path.join(rootDir, "typechain-types");

  // Only compile if typechain-types is missing (clean state)
  if (!fs.existsSync(typechainDir)) {
    console.log("\n[globalSetup] typechain-types not found, running hardhat compile...");
    execSync("npx hardhat compile", { cwd: rootDir, stdio: "inherit" });
    console.log("[globalSetup] Compilation complete.\n");
  }
}
