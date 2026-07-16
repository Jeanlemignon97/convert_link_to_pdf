# Daily Maintenance Notes - 2026-07-16

## Repository Signals

- Source files: 13
- Test files: 3
- Public UI files: 3
- Runtime dependencies: 5
- Development dependencies: 7
- Baseline commit inspected: c88d250

## Generated Review

- Keep conversion behavior conservative when the source page is ambiguous.
- Prefer deterministic extraction rules over guessing hidden site data.
- Preserve PDF layout checks when changing pagination, headers, footers, or images.
- Keep the web UI focused on batch conversion and clear export feedback.

## Next Useful Checks

- Try one single-link PDF export from the UI.
- Try one multi-link ZIP export from the UI.
- Review any failed links in `errors.txt` when batch conversion partially succeeds.
