# NITC HQ Tasks

A local task desk for NITC and IIT Madras coursework. The web app and REST API run on `127.0.0.1`; the MCP server uses standard input/output so a local agent can use the same SQLite task store. There is no cloud service or Notion connection at runtime.

## Run the website

Requires Node.js 24 or newer. From this folder, run:

```sh
./run.sh
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The first run creates `data/tasks.sqlite` and seeds the 15 task records captured from **NITC HQ Tasks** in Notion. It does not write to Notion. The app never exposes a delete action; completed tasks stay in the database and can be reopened.

The date-only fields use Asia/Kolkata for interpreting “today” and relative due dates. No reminders are scheduled.

## Agent connection

Browser agents can open the **AI agent guide** linked in the website footer or go directly to `/agent-guide.html`. It describes the task workflow, task classification, dates, priorities, safe completion behavior, and the design-only boundary. Source-editing agents should also read [`AGENTS.md`](AGENTS.md). MCP clients receive tool-specific guidance in each MCP tool description.

The MCP process is local and communicates over stdio. Add a server entry to an MCP-compatible client's configuration, replacing the placeholders with the Node 24+ binary and the project checkout path:

```json
{
  "mcpServers": {
    "nitc-hq-tasks": {
      "command": "<path-to-node>",
      "args": ["<project-path>/src/server.mjs", "--mcp"]
    }
  }
}
```

Replace `<path-to-node>` with the path to a Node.js 24 or newer binary and `<project-path>` with the absolute path to this project folder.

Available MCP tools: `list_tasks`, `search_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`, `reopen_task`, and `list_courses`. Tool descriptions tell agents to search before creating, infer task type/course and priority, use Asia/Kolkata for relative dates, and ask when a completion request matches multiple tasks. The agent interface intentionally has no delete tool.

## REST API

The API is served from the same local origin as the website:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Local service health and timezone |
| `GET` | `/api/courses` | Supported course options |
| `GET` | `/api/tasks?view=todo&course=...&q=...` | Filter and search tasks (`todo`, `done`, `all`) |
| `GET` | `/api/tasks/:id` | Fetch one task |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/:id` | Update task fields |
| `POST` | `/api/tasks/:id/complete` | Mark complete |
| `POST` | `/api/tasks/:id/reopen` | Reopen a completed task |

Task objects use `id`, `title`, `course`, `type`, `dueDate`, `notes`, `priority`, `done`, `createdAt`, and `updatedAt`. `dueDate` is a `YYYY-MM-DD` string or `null`; priority is an integer from 1 to 10 or `null` for imported records that had no priority.

## Local data and development

- `data/seed.json` is the immutable first-run snapshot; `data/tasks.sqlite` is the live local database and is ignored by version control. The seed file contains personal study notes, so keep the repo private or scrub personal data before publishing.
- The server binds only to loopback. Set `PORT` to choose a different local port (defaults to `4173` when unset).
- `npm run check` checks JavaScript syntax. `npm test` exercises the seeded REST and MCP workflows against a temporary database.
- `NITC_TASKS_DB` can point the server at another SQLite file, which is used by the isolated tests.
- `NITC_NODE_BIN` can point `run.sh` at a specific Node.js 24+ binary when `node` is not on `PATH`.
