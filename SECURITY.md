# Security Notes

This project is designed as a local-first personal tool, not as a public internet-facing medical service.

## Intended Use

- Run it on your own machine.
- Keep the backend on `localhost`.
- Treat it as a private utility for your own PDFs and extracted lab history.

## Audit Summary

Audit date: 2026-03-16

What was checked:

- hardcoded secrets and API keys
- outbound data flows
- database query safety
- file serving behavior
- OCR command execution
- publish hygiene for private local data

What was found:

- No hardcoded API keys, tokens, or passwords were found in the app source.
- No LLM or cloud AI integration was found in the app source.
- OCR runs locally using local command-line tools.
- SQL queries in the backend use parameter binding for user-supplied values.
- OCR commands use `subprocess.run([...])` without shell interpolation.

## Important Limits

### 1. No authentication

The backend currently has no login, user accounts, or access control.

That means:

- anyone who can reach the backend can read results
- anyone who can reach the backend can trigger scans
- anyone who can reach the backend can open original PDFs and previews
- anyone who can reach the backend can edit review rows

This is acceptable for local-only use on your own machine. It is not acceptable as a public internet deployment without additional protection.

### 2. CORS is not a security boundary

The backend currently allows local frontend origins. That helps browser development, but it is not real access control.

If you deploy this remotely, you still need actual authentication and network restrictions.

### 3. Untrusted PDF handling

This app processes user-provided PDFs and passes them through local OCR tools such as `pdfinfo`, `pdftoppm`, `sips`, and `tesseract`.

That means you should:

- keep those tools updated
- avoid processing PDFs from untrusted sources if possible
- run the app on a machine you control

## Local Data Locations

These locations contain private medical data or derived data and should not be committed:

- `data/`
- `storage/`
- `preview-cache/`

The root `.gitignore` is configured to exclude them.

## Publish Guidance

Safe to publish:

- source code
- tests
- docs
- dependency manifests

Do not publish:

- your personal PDFs
- `storage/med_results.db`
- generated previews in `preview-cache/`
- `.env` files if you add any later

## If You Want To Deploy It For Other People

Before doing that, add at least:

- authentication
- authorization
- HTTPS
- rate limiting
- request logging and monitoring
- secure deployment defaults
- a proper privacy policy and legal disclaimer

Until then, treat this as a local side project, not a hosted medical platform.
