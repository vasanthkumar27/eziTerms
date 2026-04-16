/**
 * Generates a "key" for Chrome extension manifest.json so the extension ID
 * stays the same on every machine (fixes redirect_uri mismatch for OAuth).
 *
 * Run: node scripts/generate-extension-key.js
 *
 * 1. Add the printed "key" to public/manifest.json under "key": "<value>"
 * 2. In Google Cloud Console, add this redirect URI (exactly, no trailing slash):
 *    https://<EXTENSION_ID>.chromiumapp.org
 *    where EXTENSION_ID is the 32-character string printed below.
 */
const crypto = require("crypto");
const { publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});

// Key for manifest: base64 of public key DER (no line wraps)
const key = publicKey.toString("base64");

// Extension ID: first 128 bits of SHA256(public key DER), encoded as 32 chars a-p
const hash = crypto.createHash("sha256").update(publicKey).digest();
const a = "a".charCodeAt(0);
let extensionId = "";
for (let i = 0; i < 16; i++) {
  extensionId += String.fromCharCode(a + (hash[i] >> 4));
  extensionId += String.fromCharCode(a + (hash[i] & 0x0f));
}

console.log("Add this to public/manifest.json as \"key\": \"<value>\":\n");
console.log(key);
console.log("\n---");
console.log("Extension ID (use in Google OAuth redirect URI):");
console.log(extensionId);
console.log("\nRedirect URI to add in Google Cloud Console:");
console.log(`https://${extensionId}.chromiumapp.org`);
console.log("\n(No trailing slash. Web application client, not Chrome app.)");
