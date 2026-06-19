---
name: supabase-schema-changes
description: It guides declarative Supabase schema edits and migration generation for this repository. Use when changing the database schema, editing webapp/supabase/schemas, or generating migrations with supabase db diff -f.
---

# Supabase Schema Changes

## Quick start

1. Edit the declarative schema files under [webapp/supabase/schemas](../../../webapp/supabase/schemas).
2. Treat [webapp/supabase/schemas/README.md](../../../webapp/supabase/schemas/README.md) as the source of truth for the workflow — including the exact command to run.
3. Stop Supabase before diffing the database.
4. Run the diff command from the schema README to generate the migration.
5. Review the generated migration before continuing.

## Workflow

- Make the schema change in `webapp/supabase/schemas` first, not in `webapp/supabase/migrations`.
- Use a short, descriptive migration name.
- Regenerate the migration if the diff does not match the intended schema change.
- Keep the migration limited to the schema change that was actually made.

## Validation

- Confirm the generated migration reflects only the intended database change.

## Guardrails

- Do not hand-write migrations in `webapp/supabase/migrations` unless a maintainer explicitly asks for that.
- Do not skip the Supabase shutdown step before running the diff.
- If the diff looks wrong, inspect the schema files again before rerunning the command.

## Reference

- [Schema README](../../../webapp/supabase/schemas/README.md)
