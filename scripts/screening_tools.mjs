#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { TextDecoder } from "node:util";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function decodeUtf8(path) {
  const bytes = readFileSync(path);
  const hasBom = bytes.subarray(0, 3).equals(BOM);
  const content = hasBom ? bytes.subarray(3) : bytes;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    fail(`${path} is not valid UTF-8.`);
  }
  if (!Buffer.from(text, "utf8").equals(content)) {
    fail(`${path} cannot be round-tripped as exact UTF-8.`);
  }
  const newline = text.includes("\r\n") ? "CRLF" : text.includes("\n") ? "LF" : "none";
  return { bytes, content, text, hasBom, newline };
}

function splitRis(text) {
  const starts = [...text.matchAll(/^TY  -/gm)].map((match) => match.index);
  if (starts.length === 0) fail("No RIS TY  - record starts were found.");
  const prefix = text.slice(0, starts[0]);
  if (prefix.trim() !== "") fail("Unexpected non-whitespace content before the first RIS record.");
  const records = starts.map((start, index) =>
    text.slice(start, index + 1 < starts.length ? starts[index + 1] : text.length),
  );
  for (let index = 0; index < records.length; index += 1) {
    if (!/^TY  -/m.test(records[index]) || !/^ER  -\s*$/m.test(records[index])) {
      fail(`RIS record ${index + 1} is missing TY  - or ER  - boundaries.`);
    }
  }
  return records;
}

function splitBlankline(text) {
  const records = [];
  const separator = /(?:\r?\n[ \t]*){2,}/g;
  let start = 0;
  for (const match of text.matchAll(separator)) {
    const end = match.index + match[0].length;
    const record = text.slice(start, end);
    if (record.trim() !== "") records.push(record);
    start = end;
  }
  const tail = text.slice(start);
  if (tail.trim() !== "") records.push(tail);
  if (records.length === 0) fail("No non-empty records were found.");
  if (records.join("") !== text) {
    fail("Blank-line parsing could not preserve the complete source text.");
  }
  return records;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`Cannot parse JSON ${path}: ${error.message}`);
  }
}

function readJsonl(path) {
  if (!existsSync(path)) fail(`Missing JSONL file: ${path}`);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`Invalid JSON on ${path} line ${index + 1}: ${error.message}`);
    }
  });
}

function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

function validateConfig(config) {
  if (config.version !== 1) fail("Config version must be 1.");
  if (!["auto", "ris", "blankline_txt"].includes(config.source_format)) {
    fail("source_format must be auto, ris, or blankline_txt.");
  }
  if (!["single", "double_independent"].includes(config.mode)) {
    fail("mode must be single or double_independent.");
  }
  if (!Number.isInteger(config.batch_size) || config.batch_size < 1) {
    fail("batch_size must be a positive integer.");
  }
  if (!config.criteria || !Array.isArray(config.criteria.inclusion) || !Array.isArray(config.criteria.exclusion)) {
    fail("criteria.inclusion and criteria.exclusion must be arrays.");
  }
  if (!Array.isArray(config.labels) || config.labels.length < 2) fail("At least two labels are required.");
  const names = config.labels.map((label) => label.name);
  if (names.some((name) => typeof name !== "string" || name.trim() === "")) fail("Every label needs a name.");
  if (new Set(names).size !== names.length) fail("Label names must be unique.");
  if (!Array.isArray(config.label_priority) || config.label_priority.length !== names.length) {
    fail("label_priority must contain every label exactly once.");
  }
  if (new Set(config.label_priority).size !== names.length || names.some((name) => !config.label_priority.includes(name))) {
    fail("label_priority must contain every label exactly once.");
  }
  if (!Array.isArray(config.evidence_fields) || config.evidence_fields.length === 0) {
    fail("evidence_fields must be a non-empty array.");
  }
}

function ensureEmptyOrMissing(path) {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) fail(`Project path is not a directory: ${path}`);
  if (readdirSync(path).length !== 0) fail(`Project directory is not empty: ${path}`);
}

function prepare(options) {
  for (const name of ["source", "config", "project"]) if (!options[name]) fail(`prepare requires --${name}.`);
  const source = resolve(options.source);
  const configPath = resolve(options.config);
  const project = resolve(options.project);
  if (!existsSync(source)) fail(`Source does not exist: ${source}`);
  if (!existsSync(configPath)) fail(`Config does not exist: ${configPath}`);
  ensureEmptyOrMissing(project);

  const config = readJson(configPath);
  validateConfig(config);
  const decoded = decodeUtf8(source);
  let format = config.source_format;
  if (format === "auto") format = /^TY  -/m.test(decoded.text) && /^ER  -\s*$/m.test(decoded.text) ? "ris" : "blankline_txt";
  const records = format === "ris" ? splitRis(decoded.text) : splitBlankline(decoded.text);

  mkdirSync(project, { recursive: true });
  mkdirSync(join(project, "audit"), { recursive: true });
  mkdirSync(join(project, "state"), { recursive: true });
  mkdirSync(join(project, config.output?.directory || "output"), { recursive: true });
  copyFileSync(configPath, join(project, "screening-config.json"));
  const recordRows = records.map((rawText, index) => ({
    id: index + 1,
    sha256: sha256(Buffer.from(rawText, "utf8")),
    raw_text: rawText,
  }));
  writeAtomic(
    join(project, "records.jsonl"),
    `${recordRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  const manifest = {
    version: 1,
    source_path: source,
    source_name: basename(source),
    source_sha256: sha256(decoded.bytes),
    source_size: decoded.bytes.length,
    source_format: format,
    source_bom: decoded.hasBom,
    source_newline: decoded.newline,
    record_count: records.length,
    batch_size: config.batch_size,
    prepared_at: new Date().toISOString(),
  };
  writeAtomic(join(project, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const progress = {
    source_sha256: manifest.source_sha256,
    record_count: manifest.record_count,
    mode: config.mode,
    pass1_completed_through_id: 0,
    pass2_completed_through_id: 0,
    adjudication_completed: false,
    next_action: `pass1:1-${Math.min(config.batch_size, records.length)}`,
    updated_at: new Date().toISOString(),
  };
  writeAtomic(join(project, "state", "progress.json"), `${JSON.stringify(progress, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

function loadProject(projectPath) {
  const project = resolve(projectPath || "");
  const manifestPath = join(project, "manifest.json");
  const configPath = join(project, "screening-config.json");
  if (!existsSync(manifestPath) || !existsSync(configPath)) fail(`Not a prepared screening project: ${project}`);
  const manifest = readJson(manifestPath);
  const config = readJson(configPath);
  validateConfig(config);
  const records = readJsonl(join(project, "records.jsonl"));
  if (records.length !== manifest.record_count) fail("records.jsonl count does not match manifest.json.");
  for (let index = 0; index < records.length; index += 1) {
    const row = records[index];
    if (row.id !== index + 1) fail(`records.jsonl has an invalid ID at position ${index + 1}.`);
    if (sha256(Buffer.from(row.raw_text, "utf8")) !== row.sha256) fail(`Stored record ${row.id} failed its hash check.`);
  }
  return { project, manifest, config, records };
}

function batch(options) {
  if (!options.project || !options.start || !options.end) fail("batch requires --project, --start, and --end.");
  const { records } = loadProject(options.project);
  const start = Number(options.start);
  const end = Number(options.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > records.length) {
    fail(`Invalid range ${options.start}-${options.end}; valid IDs are 1-${records.length}.`);
  }
  for (const row of records.slice(start - 1, end)) {
    process.stdout.write(`\n===== ID ${row.id} =====\n${row.raw_text}`);
    if (!row.raw_text.endsWith("\n")) process.stdout.write("\n");
  }
}

function resolveProjectFile(project, value) {
  if (!value) fail("Missing --file.");
  return isAbsolute(value) ? value : join(project, value);
}

function validateRows(options) {
  if (!options.project) fail("validate requires --project.");
  const { project, manifest, config } = loadProject(options.project);
  const path = resolveProjectFile(project, options.file);
  const rows = readJsonl(path);
  const stage = options.stage || "pass";
  if (!["pass", "final"].includes(stage)) fail("--stage must be pass or final.");
  const labelField = stage === "final" ? "final_label" : "label";
  const allowed = new Set(config.labels.map((label) => label.name));
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!Number.isInteger(row.id) || row.id < 1 || row.id > manifest.record_count) {
      fail(`Invalid ID on ${path} line ${index + 1}.`);
    }
    if (seen.has(row.id)) fail(`Duplicate ID ${row.id} in ${path}.`);
    seen.add(row.id);
    if (!allowed.has(row[labelField])) fail(`Invalid ${labelField} for ID ${row.id}: ${row[labelField]}`);
    if (stage === "pass") {
      if (typeof row.uncertain !== "boolean") fail(`Pass ID ${row.id} needs boolean uncertain.`);
      if (typeof row.reason !== "string" || row.reason.trim() === "") fail(`Pass ID ${row.id} needs a reason.`);
      if (!row.evidence || typeof row.evidence !== "object") fail(`Pass ID ${row.id} needs evidence.`);
      for (const field of config.evidence_fields) {
        if (typeof row.evidence[field] !== "string") fail(`Pass ID ${row.id} is missing evidence.${field}.`);
      }
    }
  }
  const complete = stage === "final" || options.complete === "true";
  const missing = [];
  if (complete) {
    for (let id = 1; id <= manifest.record_count; id += 1) if (!seen.has(id)) missing.push(id);
    if (missing.length > 0) fail(`Missing ${missing.length} IDs; first missing IDs: ${missing.slice(0, 20).join(", ")}`);
  }
  const summary = {
    stage,
    file: path,
    rows: rows.length,
    unique_ids: seen.size,
    expected_records: manifest.record_count,
    complete,
    labels: Object.fromEntries(
      config.labels.map((label) => [label.name, rows.filter((row) => row[labelField] === label.name).length]),
    ),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function safeFilename(label) {
  const value = label.replace(/[\\/:*?"<>|]/g, "、").replace(/[. ]+$/g, "").trim();
  if (!value) fail(`Label cannot form a safe filename: ${label}`);
  return value;
}

function exportRecords(options) {
  if (!options.project) fail("export requires --project.");
  const { project, manifest, config, records } = loadProject(options.project);
  const finalPath = resolveProjectFile(project, options.file || "final.jsonl");
  const rows = readJsonl(finalPath);
  const allowed = new Set(config.labels.map((label) => label.name));
  const decisions = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.id) || row.id < 1 || row.id > records.length) fail(`Invalid final ID: ${row.id}`);
    if (decisions.has(row.id)) fail(`Duplicate final ID: ${row.id}`);
    if (!allowed.has(row.final_label)) fail(`Invalid final label for ID ${row.id}: ${row.final_label}`);
    decisions.set(row.id, row.final_label);
  }
  if (decisions.size !== records.length) fail(`Final decisions contain ${decisions.size} of ${records.length} records.`);

  if (!existsSync(manifest.source_path)) fail(`Original source is missing: ${manifest.source_path}`);
  const sourceBytes = readFileSync(manifest.source_path);
  if (sha256(sourceBytes) !== manifest.source_sha256) fail("Original source hash has changed; export refused.");

  const outputDirectory = join(project, config.output?.directory || "output");
  mkdirSync(outputDirectory, { recursive: true });
  let extension = config.output?.extension || "source";
  if (extension === "source") extension = manifest.source_format === "ris" ? "ris" : extname(manifest.source_name).replace(/^\./, "") || "txt";
  if (!/^[a-zA-Z0-9]+$/.test(extension)) fail(`Unsafe output extension: ${extension}`);
  const bomSetting = config.output?.utf8_bom ?? "preserve";
  const addBom = bomSetting === true || (bomSetting === "preserve" && manifest.source_bom);
  const report = { source_records: records.length, outputs: {}, exported_at: new Date().toISOString() };

  for (const label of config.labels.map((item) => item.name)) {
    const selected = records.filter((record) => decisions.get(record.id) === label);
    const file = join(outputDirectory, `${safeFilename(label)}.${extension}`);
    if (existsSync(file) && options.force !== "true") fail(`Output exists; use --force true to replace it: ${file}`);
    for (const record of selected) {
      if (sha256(Buffer.from(record.raw_text, "utf8")) !== record.sha256) fail(`Record ${record.id} changed before export.`);
      if (manifest.source_format === "ris" && (!/^TY  -/m.test(record.raw_text) || !/^ER  -\s*$/m.test(record.raw_text))) {
        fail(`RIS record ${record.id} lost its boundaries.`);
      }
    }
    const body = Buffer.from(selected.map((record) => record.raw_text).join(""), "utf8");
    const bytes = addBom ? Buffer.concat([BOM, body]) : body;
    writeAtomic(file, bytes);
    report.outputs[label] = {
      file,
      records: selected.length,
      bytes: bytes.length,
      sha256: sha256(bytes),
      ids: selected.map((record) => record.id),
    };
  }
  const total = Object.values(report.outputs).reduce((sum, item) => sum + item.records, 0);
  if (total !== records.length) fail(`Exported ${total} of ${records.length} records.`);
  writeAtomic(join(project, "state", "export-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function help() {
  process.stdout.write(`Literature screening deterministic helper\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  prepare  --source FILE --config FILE --project DIR\n`);
  process.stdout.write(`  batch    --project DIR --start ID --end ID\n`);
  process.stdout.write(`  validate --project DIR --file FILE [--stage pass|final] [--complete true]\n`);
  process.stdout.write(`  export   --project DIR [--file final.jsonl] [--force true]\n`);
}

const { command, options } = parseArgs(process.argv.slice(2));
if (!command || command === "help" || command === "--help") help();
else if (command === "prepare") prepare(options);
else if (command === "batch") batch(options);
else if (command === "validate") validateRows(options);
else if (command === "export") exportRecords(options);
else fail(`Unknown command: ${command}`);
