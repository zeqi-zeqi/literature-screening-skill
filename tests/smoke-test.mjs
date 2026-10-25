import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skill = resolve(here, "..");
const helper = join(skill, "scripts", "screening_tools.mjs");
const root = mkdtempSync(join(skill, ".literature-screening-test-"));

function run(args) {
  const result = spawnSync(process.execPath, [helper, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  }
  return result.stdout;
}

try {
  const source = join(root, "sample.ris");
  const config = join(root, "config.json");
  const project = join(root, "project");
  const ris =
    "\uFEFFTY  - JOUR\r\nTI  - Community screening study\r\nAB  - First abstract.\r\nER  - \r\n\r\n" +
    "TY  - JOUR\r\nTI  - Unrelated study\r\nAB  - Second abstract.\r\nER  - \r\n\r\n";
  writeFileSync(source, ris, "utf8");
  const example = JSON.parse(readFileSync(join(skill, "assets", "screening-config.example.json"), "utf8"));
  writeFileSync(config, `${JSON.stringify(example, null, 2)}\n`, "utf8");

  run(["prepare", "--source", source, "--config", config, "--project", project]);
  const finalRows = [
    { id: 1, final_label: "Include", adjudication_reason: "Eligible.", adjudicated: true },
    { id: 2, final_label: "Exclude", adjudication_reason: "Ineligible.", adjudicated: true },
  ];
  writeFileSync(join(project, "final.jsonl"), `${finalRows.map(JSON.stringify).join("\n")}\n`, "utf8");
  run(["validate", "--project", project, "--file", "final.jsonl", "--stage", "final"]);
  run(["export", "--project", project, "--file", "final.jsonl"]);

  const include = readFileSync(join(project, "output", "Include.ris"));
  const exclude = readFileSync(join(project, "output", "Exclude.ris"));
  for (const [name, bytes] of [["Include", include], ["Exclude", exclude]]) {
    if (!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error(`${name} output lost BOM.`);
    const text = bytes.subarray(3).toString("utf8");
    if ((text.match(/^TY  -/gm) || []).length !== 1 || (text.match(/^ER  -\s*$/gm) || []).length !== 1) {
      throw new Error(`${name} output has invalid RIS boundaries.`);
    }
  }
  process.stdout.write("Smoke test passed.\n");
} finally {
  if (basename(root).startsWith(".literature-screening-test-")) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
