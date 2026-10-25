# Task configuration

Create UTF-8 `screening-config.json`. The configuration is project-specific and must reflect the user's current instructions.

## Required shape

```json
{
  "version": 1,
  "source_format": "auto",
  "mode": "double_independent",
  "batch_size": 50,
  "criteria": {
    "review_question": "Describe the review question.",
    "inclusion": ["Criterion 1", "Criterion 2"],
    "exclusion": ["Criterion 1"],
    "uncertainty_policy": "liberal_include"
  },
  "labels": [
    {"name": "Include", "description": "Meets the screening criteria."},
    {"name": "Exclude", "description": "Does not meet the screening criteria."}
  ],
  "label_priority": ["Exclude", "Include"],
  "evidence_fields": [
    "population_or_setting",
    "intervention_or_exposure",
    "care_or_topic_context",
    "study_type_and_outcomes"
  ],
  "adjudication": {
    "enabled": true,
    "triggers": ["label_disagreement", "any_uncertain", "any_include"]
  },
  "output": {
    "directory": "output",
    "extension": "source",
    "utf8_bom": "preserve"
  }
}
```

## Fields

- `source_format`: `auto`, `ris`, or `blankline_txt`. `auto` recognizes RIS only when tagged `TY  -`/`ER  -` records are present; otherwise it uses blank-line record separation.
- `mode`: `single` or `double_independent`.
- `batch_size`: positive integer. Keep batches small enough that every title and abstract can be read without truncation.
- `criteria.inclusion` and `criteria.exclusion`: user-defined semantic rules. Preserve distinctions such as “implemented in” versus “designed for” a setting.
- `criteria.uncertainty_policy`: free text such as `liberal_include`, `strict_exclude`, or a project-specific instruction.
- `labels`: the only allowed classifications. Names must be unique and safe to display.
- `label_priority`: precedence when more than one exclusion reason applies. It must contain every label exactly once.
- `evidence_fields`: short evidence dimensions to record during screening. They guide explanation but do not mechanically determine a label.
- `adjudication.triggers`: user-configurable. Supported workflow concepts include label disagreement, uncertainty, any inclusion, specified labels, or project-specific ambiguity.
- `output.extension`: `source`, `ris`, or `txt`. Do not choose `ris` for untagged input unless a valid tagged source is available.
- `output.utf8_bom`: `preserve`, `true`, or `false`.

## Optional project rules

Add explicit fields when they materially prevent scope drift, for example:

```json
{
  "deployment_policy": {
    "real_world_deployment_required": false,
    "explicitly_designed_for_target_setting": "eligible",
    "only_mentions_possible_future_use": "ineligible"
  },
  "benchmark_policy": {
    "pure_technical_benchmark": "exclude",
    "clinically_contextualized_evaluation": "consider"
  },
  "supplemental_lookup": {
    "allowed_only_when": [
      "abstract_missing",
      "publication_type_unclear",
      "material_internal_contradiction"
    ]
  }
}
```

The model must apply these fields semantically after reading the record. Scripts must not convert them into keyword rules.
