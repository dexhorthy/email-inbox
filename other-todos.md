# Other TODOs

## Code Organization
- Move command functions to individual files in a commands/ directory
  - Extract `test-one`, `test-many`, `process`, `dump` commands from cli.ts
  - Each command gets its own file: `commands/testOne.ts`, `commands/testMany.ts`, etc.
  - Keep cli.ts focused on just parsing and routing to command handlers