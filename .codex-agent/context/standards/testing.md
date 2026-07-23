# Testing

- Test observable behavior and important failure modes rather than implementation details.
- Reproduce a defect before fixing it when practical, then keep a regression test.
- Match validation effort to risk: targeted tests for small changes, broader suites for shared contracts.
- Run the narrowest useful check first, followed by the repository's required aggregate checks.
- Report the exact commands run, their outcomes, and any material paths that remain untested.
- A successful build alone does not prove runtime or user-interface behavior.

