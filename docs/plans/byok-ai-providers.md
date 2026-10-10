# BYOK for AI providers

## Subject and audience

An AI provider settings screen for Raqam business owners who want to use their own Gemini, OpenAI, Groq, or Anthropic API credentials.

## Plan

- Add a signed-in workspace settings view for selecting one active provider, entering or replacing that provider's API key, choosing supported model IDs, testing the connection, and removing the saved key.
- Add authenticated, same-origin server routes for listing only safe provider metadata and managing credentials. Never return a submitted or stored key, even masked characters. Never send a key to browser storage, logs, telemetry, or provider errors.
- Encrypt credentials with authenticated encryption before persistence. Scope records to the verified signed-in owner/workspace, enforce RLS, and require a server-only encryption secret. If the encryption secret is absent, fail closed and explain the setup requirement without echoing request data.
- Extend the server-side provider factory to consume the selected credential and provider configuration. Keep current provider interfaces, request limits, validation, cancellation, retry policy, and output contracts. Support Gemini, OpenAI, Groq, and Anthropic; show per-mode capability and availability explicitly instead of promising unsupported OCR/tool use.
- Add focused service, route, authorization, encryption, and provider-adapter tests. Document migration and deployment-secret setup. Do not call live providers as part of build/tests.

## Tokens

Reuse the workspace tokens in `src/components/ui/theme.module.css`: ink `#18191b`, canvas `#f5f5f3`, surface `#ffffff`, muted `#62656b`, border `#dfe1e3`, and status colors already defined there. Keep Arial/Helvetica, existing 4–64 px spacing scale, 10 px control radius and 18 px panel radius. Use only brief state transitions and respect reduced motion.

## Layout

Desktop: align to the existing workspace content column. A page title and short explanation sit above a provider selector; the selected provider panel contains the key input, model fields, capabilities, connection status and save/test/remove actions. A separate security note explains that Raqam stores an encrypted server-side credential and never displays it again.

```text
Workspace sidebar | Settings
                  | AI provider                         [Saved status]
                  | [Gemini] [OpenAI] [Groq] [Claude]
                  | API key  [password input] [Save key]
                  | Text model [________]  Vision model [________]
                  | Supports: text · images · tools (provider-specific)
                  | [Test connection] [Remove key]
                  | Encrypted storage / key is never shown after save
```

Mobile: stack title, provider selector, fields, capability/status text and actions in that order; controls fill the available width and do not cause horizontal scrolling.

## The one memorable thing

Make the four-provider selector the focal interaction: each option clearly shows whether its key is saved and which capabilities are available, without decorative provider-logo art or generic cards.

## Assets needed

None. This settings workflow is clearer with native text controls and existing iconography than generated imagery.

## Done criteria

- Settings is reachable in the authenticated workspace and usable at 360, 768 and 1280 px.
- Keyboard users can select providers, enter credentials and understand focus, errors, saved state, and capability limits. Labels and status messages are programmatically associated; contrast remains at least 4.5:1 for normal text.
- No credential appears in client responses, browser storage, logs, error messages, telemetry, or unauthenticated/cross-account reads. Persistence is encrypted and owner-scoped; missing encryption configuration fails closed.
- Provider mode support is explicit and tested; unsupported provider/mode combinations return a safe unavailable result.
- Run targeted tests, full backend/security tests, typecheck, build, and responsive screenshot review. No provider key or live inference is required for these checks.

## Review against frontend defaults

The design reuses Raqam's existing neutral bookkeeping tokens and workspace shell instead of introducing a generic AI dashboard, promotional hero, decorative gradients, or uniform repeated cards. Provider choice and capability status carry the visual hierarchy because they determine the user's actual configuration.
