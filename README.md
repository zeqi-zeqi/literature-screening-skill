# Literature Screening Agent Skill

A provider-neutral Agent Skill for auditable title-and-abstract screening. It supports configurable criteria and labels, one- or two-pass review, disagreement adjudication, checkpoints, exact-record export, and validation.

The model must read each title and abstract. Scripts only parse, batch, validate, and export; they never decide semantic eligibility.

## Install for DeepSeek Harness

From the review project root:

```powershell
New-Item -ItemType Directory -Force .agents\skills
git clone https://github.com/zeqi-zeqi/literature-screening-skill.git .agents\skills\literature-screening
```

Start `dsh`, choose the workspace, and invoke:

```text
/literature-screening
```

Copy `assets/screening-config.example.json` into the review project, rename it `screening-config.json`, and replace the example criteria and labels.

## Requirements

- An Agent Skills-compatible host with file access.
- Node.js for the optional deterministic helper. The helper uses no third-party packages.
- A model/API configured in the host. API credentials must not be committed to the repository or screening project.

See `references/dsh-setup.md` for paths and updating guidance.
