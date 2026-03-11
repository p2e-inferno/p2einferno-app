# MCP Extraction Instructions — AI Knowledge Base

## Purpose
These instructions guide MCP-driven data harvesting for the AI knowledge base.
For this task, MCP is used only to fetch curated live database snapshot data and
output normalized JSONL files to `automation/data/ai-kb/raw/db/`.

## Source Registry Reference
All sources are defined in `automation/config/ai-kb-sources.json`.
For this MCP task, only the registered `db:*` sources are in scope.

## Output Format
Each source produces a JSONL file (one JSON object per line).

### Required fields per JSONL record
```json
{
  "sourcePath": "db:quests_catalog",
  "title": "Quest: <title>",
  "content": "<markdown content>",
  "recordId": "<optional: primary key from source table>"
}
```

## Output Paths

### DB Snapshots → `automation/data/ai-kb/raw/db/`
- `bootcamp_programs_overview.jsonl`
- `cohorts_catalog.jsonl`
- `cohort_milestones_snapshot.jsonl`
- `milestone_tasks_snapshot.jsonl`
- `quests_catalog.jsonl`
- `quest_tasks_snapshot.jsonl`
- `daily_quests_catalog.jsonl`
- `eas_networks_config.jsonl`
- `attestation_schema_registry.jsonl`

## Extraction Rules
- Use only live database reads.
- Do not read repository documents or local files.
- Do not invent or summarize beyond shaping the approved fields into the
  requested markdown structure.
- Do not export sensitive data, secrets, auth data, signatures, wallet
  addresses, emails, phone numbers, or PII.
- Every emitted record must use the exact registered `sourcePath`.

## DB Snapshot Extraction Specs

### `db:bootcamp_programs_overview`
Output file: `automation/data/ai-kb/raw/db/bootcamp_programs_overview.jsonl`

Suggested tables:
- `bootcamp_programs`
- `cohorts`
- `program_highlights`
- `program_requirements`

Use one record per program. Include only:
- id
- name
- description
- duration_weeks
- max_reward_dgt
- related cohort names when needed to connect highlights and requirements
- highlights from `program_highlights.content`
- requirements from `program_requirements.content`

Format each record as markdown:
```md
## <program title>
- Duration Weeks: <duration_weeks>
- Max Reward DGT: <max_reward_dgt>

<program description>

### Highlights
- <highlight>

### Requirements
- <requirement>
```

### `db:cohorts_catalog`
Output file: `automation/data/ai-kb/raw/db/cohorts_catalog.jsonl`

Suggested tables:
- `cohorts`
- `bootcamp_programs`

Use one record per cohort. Include only:
- id
- name
- `bootcamp_program_id`
- related program name from `bootcamp_programs.name`
- start date
- end date
- status

Format each record as markdown:
```md
## <cohort name>
- Program: <program name>
- Start: <start date>
- End: <end date>
- Status: <status>
```

### `db:cohort_milestones_snapshot`
Output file: `automation/data/ai-kb/raw/db/cohort_milestones_snapshot.jsonl`

Suggested tables:
- `cohort_milestones`
- `cohorts`

Use one record per milestone. Include only:
- id
- name
- description
- order_index
- related cohort name

Format each record as markdown:
```md
## <milestone name>
- Cohort: <cohort name>
- Order: <order_index>

<description>
```

### `db:milestone_tasks_snapshot`
Output file: `automation/data/ai-kb/raw/db/milestone_tasks_snapshot.jsonl`

Suggested tables:
- `milestone_tasks`
- `cohort_milestones`
- `cohorts`

Use one record per milestone task. Include only:
- id
- title
- description
- order_index
- reward_amount
- task_type
- requires_admin_review
- related milestone name
- related cohort name when available

Format each record as markdown:
```md
## <task name>
- Milestone: <milestone name>
- Cohort: <cohort name>
- Order: <order_index>
- Type: <task_type>
- Reward: <reward_amount>
- Requires Review: <true|false>

<description>
```

### `db:quests_catalog`
Output file: `automation/data/ai-kb/raw/db/quests_catalog.jsonl`

Suggested tables:
- `quests`
- optional aggregated task count from `quest_tasks`

Use one record per quest. Include only:
- id
- title
- description
- is_active
- reward_type
- total_reward
- requires_gooddollar_verification
- task count if available

Format each record as markdown:
```md
## <quest title>
- Active: <true|false>
- Reward Type: <reward type>
- Total Reward: <total_reward>
- Requires GoodDollar Verification: <true|false>
- Task Count: <task count>

<description>
```

### `db:quest_tasks_snapshot`
Output file: `automation/data/ai-kb/raw/db/quest_tasks_snapshot.jsonl`

Suggested tables:
- `quest_tasks`
- `quests`

Use one record per quest task. Include only:
- id
- related quest title
- title
- description
- order_index
- task type
- reward_amount
- requires_admin_review
- verification_method

Format each record as markdown:
```md
## <task name>
- Quest: <quest title>
- Order: <order_index>
- Type: <task type>
- Reward: <reward amount>
- Requires Review: <true|false>
- Verification Method: <verification_method>

<description>
```

### `db:daily_quests_catalog`
Output file: `automation/data/ai-kb/raw/db/daily_quests_catalog.jsonl`

Suggested tables:
- `daily_quest_templates`
- optional aggregated task count from `daily_quest_tasks`

Use one record per daily quest template. Include only:
- id
- title
- description
- is_active
- completion_bonus_reward_amount
- eligibility_config when useful at a high level
- task count if available

Format each record as markdown:
```md
## <daily quest title>
- Active: <true|false>
- Completion Bonus: <completion_bonus_reward_amount>
- Task Count: <task count>

<description>
```

### `db:eas_networks_config`
Output file: `automation/data/ai-kb/raw/db/eas_networks_config.jsonl`

Suggested table:
- `eas_networks`

Use one record per enabled network. Include only:
- name
- display_name
- chain_id
- enabled status
- EAS scan base URL
- is_testnet

Format each record as markdown:
```md
## <network name>
- Network Key: <name>
- Display Name: <display_name>
- Chain ID: <chain_id>
- Enabled: <true|false>
- EAS Scan: <scan url>
- Testnet: <true|false>
```

### `db:attestation_schema_registry`
Output file: `automation/data/ai-kb/raw/db/attestation_schema_registry.jsonl`

Suggested tables:
- `attestation_schemas`
- optional `eas_schema_keys`

Use one record per schema. Include only:
- schema uid
- schema key if available
- network
- name
- description
- category
- revocable
- optional schema key label from `eas_schema_keys.label`

Format each record as markdown:
```md
## <schema label>
- Schema UID: <schema_uid>
- Schema Key: <schema_key>
- Network: <network>
- Category: <category>
- Revocable: <true|false>

<description>
```

## Validation
After extraction, run `npm run ai-kb:extract:validate` to verify:
- All JSONL files have valid format and required fields.
- Every file corresponds to a registered source.
- No registered DB snapshot sources are missing.
