# Plan

## Now: command splitter

If a bash command ends with `&&` at the top level (not inside quotes), return the left-hand side.

Example: `git status &&` → `git status`

Example: `echo 'a && b' && git status &&` → `echo 'a && b' && git status`

If the string does not end with `&&`, or quotes are unclosed, return nothing.

## Later

- Speculative execution (run the prefix while the command is still streaming)
- Command cache
