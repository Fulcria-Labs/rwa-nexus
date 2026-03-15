#!/usr/bin/env node
/**
 * Patches ts-node's ts-transpile-module.js to fix compatibility with TypeScript 5.5+.
 *
 * Issue: ts-node 10.9.x's transpileModule wrapper passes undefined as the writeFile
 * argument to program.emit(), but TypeScript 5.5+ no longer falls back to the
 * compilerHost's writeFile in that case. Additionally, .d.ts files produce no emit
 * output, causing a "Debug Failure. Output generation failed" error.
 *
 * This patch:
 * 1. Explicitly passes compilerHost.writeFile to program.emit()
 * 2. Handles .d.ts files gracefully (returns empty output instead of failing)
 */
const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "ts-node",
  "dist",
  "ts-transpile-module.js"
);

if (!fs.existsSync(filePath)) {
  console.log("[fix-ts-node] ts-node not found, skipping patch.");
  process.exit(0);
}

let content = fs.readFileSync(filePath, "utf-8");

// Check if already patched
if (content.includes("compilerHost.writeFile")) {
  console.log("[fix-ts-node] Already patched, skipping.");
  process.exit(0);
}

// Patch 1: Pass compilerHost.writeFile explicitly to program.emit()
content = content.replace(
  /\/\*writeFile\*\/ undefined,/,
  "/*writeFile*/ compilerHost.writeFile,"
);

// Patch 2: Handle .d.ts files that produce no output
content = content.replace(
  /if \(outputText === undefined\)\s*\n\s*return Debug\.fail\('Output generation failed'\);/,
  `if (outputText === undefined) {
            if (inputFileName.endsWith('.d.ts')) {
                return { outputText: '', diagnostics: diagnostics, sourceMapText: '{"version":3,"sources":[],"mappings":""}' };
            }
            return Debug.fail('Output generation failed');
        }`
);

fs.writeFileSync(filePath, content);
console.log("[fix-ts-node] Successfully patched ts-transpile-module.js for TypeScript 5.5+ compatibility.");
