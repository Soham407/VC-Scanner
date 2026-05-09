# VS Scanner

Expo (React Native) prototype that scans business cards: capture → on-device OCR (ML Kit) → Groq LLM parse via Supabase Edge Function → durable storage in Supabase.

## Agent skills

### Backlog

GitHub Issues on `Soham407/VC-Scanner` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.


<claude-mem-context>
# Memory Context

# [VS_Scanner] recent context, 2026-05-04 11:44am GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 19 obs (6,610t read) | 82,344t work | 92% savings

### May 4, 2026
33 11:00a 🔵 Team leadership and worker assignment architecture confirmed
34 11:01a 🔵 Complete team assignment workflow implementation verified
35 11:02a 🔵 Team context switching implemented via user_team_contexts table
36 " 🟣 Batch item management and assignment reassignment added to teamAssignments API
37 " ✅ Leader inbox query refactored to show all team leads including assigned ones
38 " 🟣 Database migration adds batch item editing and lead reassignment RPC functions
39 " ✅ useTeamWorkspace hook extended with batch item management and reassignment
40 11:03a 🟣 useTeamWorkspace hook implements batch item management and reassignment operations
41 " 🟣 TeamAssignmentBatchSheet UI component for batch editing and curation
42 " 🟣 TeamReassignSheet UI component for reassigning leads to different workers
43 11:04a ✅ HistoryScreen component integrated with batch editing and reassignment UI
44 " ✅ App component integrated with batch editing and reassignment sheet references
45 " ✅ App component event handlers and batch item filtering for sheet interactions
46 " ✅ App component rendered the batch editing and reassignment bottom sheets
47 11:05a 🔴 approveBatch callback now clears and refreshes batch state after approval
48 " 🔵 App.tsx references undefined savedCount and needsReviewCount variables
49 " 🔴 MetricRail component fixed to use defined count variables by mode
50 " ✅ Batch action button enable conditions refined to prevent invalid operations
51 " 🟣 approve_team_assignment_batch RPC function implemented with load-balanced round-robin distribution

Access 82k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>