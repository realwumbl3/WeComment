# WeComment — Product + Tech Plan


## Current Features

- **Core value**: Provide an alternative comment layer on YouTube videos where native comments are turned off.

### Extension (MV3)
- **Automatic detection of comment-off state**: Observes YouTube DOM for the "Comments are turned off" message and reacts.
- **Non-destructive UI injection**:
  - Injects a `WeComment` container above native comments.
  - Collapsible container when YT comments are available; always expanded when comments are turned off.
- **Auth UI**:
  - Google Sign-In flow that opens backend OAuth window; token returned via `postMessage` and stored in `chrome.storage.local`.
  - Shows current user avatar/name and allows sign-out.
- **Comment composer**: Textarea and Post button to add comments for the active video (requires auth).
- **Threaded comments**: Renders top-level comments and nested replies, with indentation and basic styles.
- **Voting**:
  - Toggle upvote per user per comment; local UI updates and score display.
  - Highlights active vote state.
- **Sorting**:
  - Switch between `Top` (score, then recency) and `Newest`.
- **Video Hub view**:
  - Adds a "Disabled Comments" sidebar link under YouTube’s Explore section.
  - Dedicated in-page hub listing videos with WeComment activity (grid of cards), including title, channel, thumbnail, counts, and badge if YT comments are disabled.
  - Refresh button to reload list via backend `/api/videos?yt_disabled=1`.
- **Resilient navigation handling**:
  - SPA navigation listeners (`yt-navigate`, `hashchange`, `popstate`) and URL polling.
  - Cleans up injected UI on navigation and reinjects on eligible pages.
- **Settings**:
  - Options and popup pages to configure backend base URL.
  - Popup shows auth status and allows sign-in/out.
- **Styling**:
  - Compact, YouTube-dark themed styles; emoji flag sequences rendered using Twemoji SVGs for consistent appearance.
- **Security-conscious client**:
  - Never sends or persists client-provided flags (e.g., whether YT comments are disabled); relies on backend to determine metadata.

### Backend (Flask + SQLAlchemy)
- **Models**: `User`, `Video`, `Comment`, `Vote` with timestamps and constraints.
- **YouTube metadata enrichment**:
  - Fetches `title`, `channel_id`, `channel_title`, and `thumbnail_url` for videos server-side.
  - Detects whether native YouTube comments are disabled using YouTube Data API error reason matching.
- **Authentication**:
  - Google OAuth (Authorization Code) with CSRF `state` in an HttpOnly cookie.
  - Issues short-lived HS256 JWT access tokens for the extension.
- **API**:
  - `GET /` — health.
  - `GET /api/videos/:id` — get/create a video record; enriches with YT metadata and disabled-state.
  - `GET /api/videos?has_comments=1&limit=N&yt_disabled=0|1` — list videos with counts, last activity, and optional filter by YT disabled flag.
  - `GET /api/videos/:id/comments?sort=top|new` — list threaded comments with user, score, and voted state for requester.
  - `POST /api/videos/:id/comments` — create comment or reply (Bearer JWT).
  - `POST /api/comments/:commentId/vote` — toggle vote (Bearer JWT).
- **Thread building**:
  - Server flattens comments and builds nested reply arrays; sorts by selected mode.
- **CORS**: Configurable origins via `CORS_ORIGINS` env var.
- **Persistence**: SQLite database in `instance/` by default.
- **Config via `.env`**: Backed by `dotenv`; secrets, OAuth, and API keys loaded from environment.

### Deployment / Ops
- **Gunicorn + systemd**: Service runs as user `wumbl3priv`, group `www-data`; binds a Unix socket in `instance/`.
- **Nginx**: Reverse proxies to the socket; CORS is handled in Flask (not added in Nginx).
- **Production notes**: Steps for enabling Google OAuth in production and setting backend URL in the extension.


## Potential Improvements

### Product / UX
- **Rich text**: Minimal formatting (links, code spans, line breaks preserved safely) beyond current pre-wrap; markdown subset support.
- **Reactions**: Add lightweight reactions (e.g., ❤️ 😂) in addition to votes.
- **Permalinks and deep links**: Link directly to a specific comment or reply, with auto-expand.
- **User mentions**: `@username` autocompletion and notifications (future server support required).
- **Load more**: Pagination or incremental loading for long threads; collapse auto-expanded long replies.
- **Edit/delete**: Allow users to edit or delete their own comments within a time window; add server endpoints with auditing.
- **Moderation tools**: Report/flag, shadowban, and mod/admin roles; basic spam heuristics.
- **Accessibility**: Keyboard navigation, ARIA roles/labels, focus management, high-contrast mode.
- **Localization**: i18n for UI strings and date formatting.
- **Theming**: Respect YouTube light theme; add theme variables for adaptability.

### Extension Engineering
- **Heuristic improvements**: More robust detection of the “comments off” state across locales; reduce false negatives/positives.
- **Performance**: Virtualize long lists; avoid full re-render on vote changes; memoize DOM nodes.
- **State management**: Introduce a small state container to reduce cross-function globals and race conditions.
- **Resilience**: Retry with backoff for network calls; better error toasts; offline queue for comment posts.
- **Security**: Content Security Policy tightening; sanitize `innerHTML` injection points; isolate SVG rendering more strictly.
- **Options sync**: Sync more settings (sort preference, expanded state) across devices via `chrome.storage.sync`.
- **Icon and branding**: Polish icons; add a toolbar badge state when on eligible pages.

### Backend Engineering
- **Auth hardening**: Verify ID token signature and audience in production; rotate JWT secrets; shorter token TTL + refresh.
- **Rate limiting**: IP/user-based limits for posting and voting.
- **Spam prevention**: Honeypots, content rules, and velocity checks.
- **Abuse handling**: Soft delete with audit trail; IP fingerprinting; ban lists.
- **Pagination**: Cursor-based pagination for comments and videos.
- **Search**: Full-text search on comments; filter by channel/user.
- **Notifications**: Email or webhook hooks for replies/mentions (requires permissions and opt-in).
- **Webhooks / Events**: Emit events for analytics and moderation dashboards.
- **Migrations**: Introduce Alembic for schema migrations beyond `db.create_all()`.
- **ORM hygiene**: Add indexes for hot queries; eager-load where appropriate.
- **Caching**: Cache YouTube metadata and disabled-state checks with TTL; backfill periodic jobs.
- **Testing**: Unit tests for routes, auth, and YouTube integrations; CI matrix.

### Data and Privacy
- **Privacy policy**: Publish clear policy and data retention guidelines.
- **GDPR/CCPA readiness**: Data export and deletion endpoints; consent flows.
- **PII minimization**: Store only necessary profile fields; hash emails if unneeded plain.
- **Encryption**: At-rest encryption options for sensitive fields if moving beyond SQLite.

### DevEx / Tooling
- **Local dev**: Make/dev containers; seed scripts; sample data fixtures.
- **CI/CD**: Lint/test workflows; deploy via GitHub Actions; environment promotion.
- **Observability**: Structured logging, Sentry, and basic metrics (requests, errors, latency).
- **Docs**: API reference via OpenAPI; contribution guidelines.

### Platform Expansion
- **Firefox support**: MV3 compatibility layer or MV2 build where required.
- **Edge and Brave**: Publish variants with appropriate store listings.
- **Other platforms**: Explore support on mobile via Kiwi/Firefox Android, within CSP constraints.

### Legal / Safety
- **Terms of Service**: Publish ToS and acceptable use.
- **Content moderation**: Policy framework and escalation path.


## Near-term Roadmap (proposed)

1. Backend hardening: auth verification, rate limiting, simple spam checks.
2. Pagination for comments and video hub; UI list virtualization.
3. Edit/delete own comments (with audit) and basic report flow.
4. Error UX: retries, toasts, and session-expiry handling.
5. Testing and CI, plus Alembic migrations.
6. Firefox build path and store prep.
