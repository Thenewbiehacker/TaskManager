# NITC HQ Tasks — coding-agent instructions

This project is a local coursework task manager. For task workflow rules, read [`public/agent-guide.html`](public/agent-guide.html) and retain those rules when changing the app.

## Design-only changes

When asked to polish the design, restrict changes to `public/styles.css` and presentation-only markup in `public/index.html`. Keep all existing task data and behavior intact.

- Do not modify `src/server.mjs`, `public/app.js`, `data/seed.json`, or `data/tasks.sqlite` for a design-only request.
- Preserve every existing DOM id, form name, `data-*` attribute, route, API field, MCP tool name and argument, validation rule, and task workflow.
- Do not delete tasks, reseed or rewrite the live database, change date or priority semantics, or connect to or write to Notion.
- Retain semantic HTML, accessible labels, keyboard operation, visible focus, reduced-motion support, and responsive behavior down to 320px.
- Preserve the established course identity colors and pair color with text; do not introduce meaning conveyed only by color.
- If a requested design change seems to require a behavior or data change, leave that change alone and explain the constraint.

Before finishing, review the diff for accidental behavior or data changes. Run the existing checks when verification is requested or appropriate; do not replace task data with test fixtures.
