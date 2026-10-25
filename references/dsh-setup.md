# DeepSeek Harness setup

DSH discovers project skills under either:

```text
<project>/.dsh/skills/literature-screening/SKILL.md
<project>/.agents/skills/literature-screening/SKILL.md
```

Prefer `.agents/skills` when the same repository should also work with other Agent Skills hosts.

## Install from GitHub

Review the repository before running scripts, then clone it from the project root:

```powershell
New-Item -ItemType Directory -Force .agents\skills
git clone <repository-url> .agents\skills\literature-screening
```

For user-wide use, clone under `%USERPROFILE%\.agents\skills\literature-screening` instead. Project installation is safer and pins the workflow to the review project.

Start DSH in the project root and invoke:

```text
/literature-screening
```

Then provide the source file and project-specific criteria. The skill does not contain a fixed medical topic or fixed eligibility criteria.

## Update

Inspect changes before updating. From the project root:

```powershell
git -C .agents\skills\literature-screening fetch
git -C .agents\skills\literature-screening diff HEAD..origin/main
git -C .agents\skills\literature-screening pull --ff-only
```

Do not update a skill midway through an active screening project unless the user explicitly accepts the protocol change and records the new version.
