# Flsko Security Notes

## Implemented baseline

- OAuth-based user identity.
- Protected tRPC procedures for chat, memory, generations, and knowledge submissions.
- User IDs are taken from the authenticated server context rather than the client payload.
- Generation records and memories are scoped to the authenticated user.
- AI provider credentials are read by server-side code only.
- User-submitted public sources require an explicit permission field.
- The client does not include social-platform credentials or scraping logic.

## Required before production

- Add request rate limits per user and per IP.
- Add a queue and worker for long-running video tasks; do not block a request on GPU inference.
- Validate provider callbacks with signed webhooks and never trust a returned asset URL without allowlisting.
- Add malware scanning and MIME/size limits for uploads.
- Encrypt database backups and define retention/deletion policies.
- Add a user-facing export and permanent deletion flow.
- Add moderation, copyright review, and public-source takedown handling.
- Rotate provider credentials and keep them in managed secrets, never in the mobile bundle.
- Add admin audit logs and least-privilege roles before opening knowledge-source review.
- Conduct an independent security review and privacy/legal review for the jurisdictions where Flsko operates.
