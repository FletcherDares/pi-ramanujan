# Plan

Two things.

## 1. Speculative `&&`

If a bash command is still streaming and the text so far ends with `&&`, run the first part immediately.

Example: the model is typing `git status && git diff`. As soon as we see `git status &&`, start `git status`. When the full command arrives, only run the rest and glue the output back together.

Only do this for safe, read-only prefixes (`git status`, `git diff`, …). Never for writes. Don't split inside quotes.

## 2. Command cache

Cache the results of simple commands like `git status`.

Drop the cache when it might be wrong:

- the agent edits or writes a file
- a file in the repo changes on disk
- git metadata changes (`.git/HEAD`, `.git/index`)

Don't cache anything that might mutate the machine (`git add`, `npm`, `rm`, …).
