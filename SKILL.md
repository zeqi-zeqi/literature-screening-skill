---
name: literature-screening
description: Run auditable title-and-abstract literature screening with user-supplied criteria, configurable labels, checkpointed one- or two-pass review, disagreement adjudication, and exact-record export. Use for systematic, scoping, rapid, or evidence-review screening; do not use for full-text review unless the user explicitly requests it.
---

# Literature Screening

Use the user's current criteria as the authority. Do not silently reuse criteria, labels, or thresholds from an earlier project.

## Non-negotiable boundary

- Read every title and available abstract before assigning its label.
- Do not let keywords, regexes, scripts, embeddings, votes, or a local model determine the final semantic classification.
- Use deterministic scripts only to parse records, assign IDs, form batches, validate schemas, find missing/duplicate IDs, checkpoint progress, and export original record blocks.
- Never add a stricter requirement such as real-world deployment, a particular study design, or a clinical endpoint unless the user's criteria require it.
- Keep the source file immutable. Preserve original record order and exact record text when exporting.

## Start a project

1. Read [references/task-config-schema.md](references/task-config-schema.md).
2. Convert the user's instructions into `screening-config.json`. Ask only when a missing choice would materially change eligibility or labels.
3. Run:

   ```text
   node <skill>/scripts/screening_tools.mjs prepare --source <file> --config screening-config.json --project <project-dir>
   ```

4. Check the reported format, record count, source hash, BOM, and newline style before screening.
5. If parsing is ambiguous or the detected count conflicts with the user's expectation, stop and report the discrepancy rather than guessing record boundaries.

The helper requires only Node.js built-ins. If `node` is unavailable, perform the same invariants with the host's safe file tools and retain the audit schemas below.

## Screen in batches

Read [references/audit-schema.md](references/audit-schema.md) before producing pass files.

- Respect `batch_size` from the configuration.
- Use `batch` to display a bounded ID range:

  ```text
  node <skill>/scripts/screening_tools.mjs batch --project <project-dir> --start 1 --end 50
  ```

- For each record, save exactly one JSON object to the current pass JSONL.
- Give short, record-specific reasons. Do not paste the whole abstract into the reason.
- Mark genuine ambiguity with `uncertain: true`; do not use uncertainty to avoid making the best available classification.
- After each completed batch, validate it and update `state/progress.json` atomically.

For a two-pass task, complete pass 1 before beginning pass 2. During pass 2, reread the original record and configuration in a fresh context. Do not read, reveal, summarize, or load pass-1 labels or reasons until pass 2 is complete and validated.

## Adjudicate

After all required passes are complete:

1. Compare passes deterministically to identify the triggers configured in `adjudication.triggers`.
2. Reread the complete original title and abstract for every triggered record.
3. Treat passes as equal evidence; do not mechanically prefer either pass or use majority voting.
4. Apply the user's uncertainty policy. When the task is an initial screen and the user prioritizes sensitivity, retain plausible records rather than demanding evidence reserved for full-text review.
5. Save one `final.jsonl` row for every record.

## Validate and export

Run:

```text
node <skill>/scripts/screening_tools.mjs validate --project <project-dir> --file final.jsonl --stage final
node <skill>/scripts/screening_tools.mjs export --project <project-dir> --file final.jsonl
```

Do not claim completion unless validation confirms:

- the source hash is unchanged;
- IDs are unique and complete;
- every record has exactly one allowed final label;
- output counts sum to the source count;
- no record appears in more than one output;
- output order follows source order;
- exported record content matches the stored source block byte-for-byte after UTF-8 round-trip;
- RIS output, when applicable, retains `TY  -` and `ER  -` boundaries.

If the input is not tagged bibliographic data, do not describe the output as EndNote-importable RIS. A plain citation-and-abstract TXT requires either a custom EndNote filter or a matching tagged/RIS source.

## Deliver

Report the source count, counts per final label, pass disagreements, adjudicated count, unresolved issues, and validation status. Deliver only the files requested by the user; retain audit and checkpoint files inside the project directory.

For DSH installation and invocation, read [references/dsh-setup.md](references/dsh-setup.md).
