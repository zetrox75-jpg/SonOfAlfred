// Builds a signed release (usage: npm.cmd run release -- 0.1.1). Publishes nothing.
//
// Sets the version in package.json, tauri.conf.json and Cargo.toml, builds both installers signed
// with the updater key, and puts everything to upload in src-tauri/target/release/bundle/upload/:
// the installers (spaces become dots, as GitHub renames them) and latest.json, which installed
// copies read. Upload those files to a GitHub release tagged v<version>.
//
// The private key stays outside the repository: ~/.tauri/aion2-craft-profit-manager.key.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("Usage: npm.cmd run release -- <x.y.z>");
const KEY = join(homedir(), ".tauri", "aion2-craft-profit-manager.key");
if (!existsSync(KEY)) throw new Error(`Signing key not found: ${KEY}`);

const ROOT = join(import.meta.dirname, "..");
const REPO = "zetrox75-jpg/SonOfAlfred";
const replace = (file, pattern, value) => {
  const p = join(ROOT, file);
  const s = readFileSync(p, "utf8");
  if (!pattern.test(s)) throw new Error(`Version not found in ${file}`);
  writeFileSync(p, s.replace(pattern, value));
};
replace("package.json", /"version": "[^"]+"/, `"version": "${version}"`);
replace("src-tauri/tauri.conf.json", /"version": "[^"]+"/, `"version": "${version}"`);
replace("src-tauri/Cargo.toml", /^version = "[^"]+"/m, `version = "${version}"`);

execFileSync(process.execPath, [join(ROOT, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" },
});

const BUNDLE = join(ROOT, "src-tauri", "target", "release", "bundle");
const OUT = join(BUNDLE, "upload");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

const platforms = {};
for (const [dir, kind, end] of [["nsis", "nsis", "-setup.exe"], ["msi", "msi", ".msi"]]) {
  const file = readdirSync(join(BUNDLE, dir)).find((f) => f.includes(`_${version}_`) && f.endsWith(end));
  if (!file) throw new Error(`No ${kind} installer for ${version}`);
  const name = file.replaceAll(" ", ".");
  cpSync(join(BUNDLE, dir, file), join(OUT, name));
  platforms[`windows-x86_64-${kind}`] = {
    signature: readFileSync(join(BUNDLE, dir, `${file}.sig`), "utf8"),
    url: `https://github.com/${REPO}/releases/download/v${version}/${name}`,
  };
}
platforms["windows-x86_64"] = platforms["windows-x86_64-nsis"];
writeFileSync(join(OUT, "latest.json"), `${JSON.stringify({ version, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`);
console.log(`Ready to upload to release v${version}: ${OUT}`);
