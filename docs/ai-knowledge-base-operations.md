# AI Knowledge Base — Operations Guide

## Overview
The AI knowledge base stores non-sensitive app/domain knowledge and curated
operational dataset snapshots for hybrid retrieval (keyword + semantic).

## Architecture
- **Database**: Three tables (`ai_kb_documents`, `ai_kb_chunks`, `ai_kb_ingestion_runs`)
  in Supabase with pgvector for embeddings.
- **Search**: Hybrid search RPC (`search_ai_kb_chunks`) blending full-text ranking
  (0.35 weight) with semantic similarity (0.65 weight).
- **External compatibility**: `match_documents` RPC for LangChain/n8n/LlamaIndex
  integrations (pure semantic similarity).
- **Write path**: All writes go through `upsert_kb_document_with_chunks` RPC
  (atomic, transactional).

## Pipeline

### 1. Extract (MCP)
MCP fetches allowlisted data and outputs JSONL files.
```bash
# Validate MCP output
npm run ai-kb:extract:validate
```

### 2. Build
```bash
# Full build (re-embeds everything)
npm run ai-kb:build

# Incremental build (skips unchanged documents)
npm run ai-kb:build:incremental
```

### 3. Verify
```bash
npm run ai-kb:verify
```

## Run Order
1. **Human**: Approves source registry entries in `automation/config/ai-kb-sources.json`.
2. **MCP**: Extracts data to `automation/data/ai-kb/raw/`.
3. **Codex/Claude**: Runs `ai-kb:build` then `ai-kb:verify`.
4. **Human**: Reviews verification report, approves for production use.

## Source Registry
File: `automation/config/ai-kb-sources.json`

Add new sources when new features/tables are added. Each entry requires:
- `sourcePath`: Unique logical path (e.g., `docs/new-feature.md` or `db:new_table`)
- `sourceType`: One of `code`, `doc`, `db_snapshot`, `faq`, `playbook`
- `title`: Human-readable title
- `audience`: Array of `support`, `sales`, `social`, `ops`
- `domainTags`: Array of domain tags for filtering
- `staleDays`: Max days before verify.ts flags as stale

## Concurrency
- Table-based locking via `ai_kb_ingestion_runs.status`.
- If a run is in progress (<60 min), new runs exit with code 0.
- Stale runs (>60 min) are auto-marked as failed.

## Embedding Model
- Default: `openai/text-embedding-3-small` (1536 dimensions)
- Configure via `OPENROUTER_EMBEDDING_MODEL` env var.
- **Changing the model**: Run `npm run ai-kb:build` (full mode) to re-embed all
  chunks. `verify.ts` will FAIL if mixed models exist.

## Rollback
To rollback a bad ingestion run:
```sql
DELETE FROM ai_kb_documents WHERE ingestion_run_id = '<bad-run-id>';
-- Cascade deletes handle chunks automatically.
```
Then re-run `npm run ai-kb:build`.

## External Search API
- Endpoint: `POST /api/ai/kb/search`
- Auth: `Authorization: Bearer <AI_KB_API_SECRET>`
- Body: `{ "query": "...", "audience": [...], "domainTags": [...], "limit": 8 }`
- Generate secret: `openssl rand -hex 32`

## Environment Variables
| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (existing) |
| `OPENROUTER_EMBEDDING_MODEL` | Embedding model override (default: `openai/text-embedding-3-small`) |
| `AI_KB_API_SECRET` | Shared secret for external search API callers |

## Refresh Cadence
- DB snapshots: Weekly
- Code/docs: On significant changes
- FAQ/playbooks: Every 2 weeks

## Troubleshooting
- **Build hangs**: Check for stale `started` runs in `ai_kb_ingestion_runs`.
  The 60-minute timeout will auto-recover on next run.
- **Mixed embedding models**: Run full build to re-embed all chunks.
- **Missing sources**: Check `ai-kb-sources.json` has entries for all needed sources.
- **Orphaned documents**: `build.ts` step 4 deactivates documents not in registry.
