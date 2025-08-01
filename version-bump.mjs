import { readFileSync, writeFileSync } from "fs";

// Get the version from package.json
const targetVersion = process.env.npm_package_version;

// Read minAppVersion from manifest.json and update version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Update versions.json
let versions = {};
try {
  versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch (e) {
  console.log("Could not find versions.json, creating a new one");
}
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

console.log(`Version bump to ${targetVersion} completed.`);