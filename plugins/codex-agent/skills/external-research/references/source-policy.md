# Source Policy

Use this priority:

1. Local source, types, generated API clients, lockfiles, and executable help for the installed version.
2. First-party connector or official API.
3. Official product or developer documentation.
4. Primary upstream repository, release notes, and specifications.
5. Secondary sources only for context, never as sole support for a critical technical contract.

When sources disagree, prefer the source that matches the installed version and verified runtime behavior. State the conflict instead of silently combining incompatible guidance.

Do not bypass authentication, paywalls, or browser safety interstitials. Ask the user to authenticate in the selected surface when access is required.

