---
title: Shell Tricks
slug: shell-tricks
author: m4xx3d0ut
summary: Quick-use bash patterns for redirection, JSON handling, recursive search/replace,
  and filesystem loops.
tags:
- m4xx3d
- shell
- bash
- automation
- productivity
publishedAt: 2023-07-21
updatedAt: 2023-12-04
---
## TLDR;

- Use `tee` to capture stdout to both the terminal and a log, and lean on `jq` for rapid pretty-printing or minifying JSON.
- Remember the regex basics for `grep`, including escaping braces and switching to `-E` for extended features.
- Combine `grep -rl` with `xargs` and `sed -i` for project-wide search-and-replace, and use parameter expansion (`${path##*/}`) to grab filenames within loops.

## Working Notes... In Graphic Detail...

### STDOUT Redirection

Write STDOUT to console and file:

```bash
command | tee command.log
```

### JSON Helpers

Pretty-print JSON:

```bash
jq . sample.json > pretty.json
```

Minify JSON:

```bash
jq -c < pretty.json
```

### JSON Diffing

Diff an application bundle after pretty-printing:

```bash
cat min/skybox-default-streams.json.live.min | jq . > test.json

diff -y -d test.json pp-skybox-default-streams.json
```

### `grep` Patterns and Wildcards

Match `OS{...}` blocks with basic regex:

```bash
grep 'OS\{.*\}' your_file.txt
```

Switch to extended regex if you want the shorthand without escaping braces:

```bash
grep -E 'OS{.*}' your_file.txt
```

### Path and Loop Utilities

Grab the last path element with parameter expansion:

```bash
path="/path/to/your/directory/file.txt"
last_element="${path##*/}"
echo "Last element: $last_element"
```

Iterate through files in the current directory:

```bash
for file in "$(pwd)"/*; do
  [ -f "$file" ] && echo "Processing file: $file"
done
```

Template script to walk a directory:

```bash
#!/bin/bash

# Directory to iterate
directory="/path/to/your/directory"

for file in "$directory"/*; do
  if [ -f "$file" ]; then
    echo "Processing file: $file"
    # Add work here
  fi
done
```

### Recursive Find & Replace

Search recursively, emit matching filenames, and replace text in place:

```bash
grep -rli 'old-word' . | xargs -I@ sed -i 's/old-word/new-word/g' @
```

`grep` flags:
- `-r` — recurse directories
- `-l` — print matching filenames
- `-i` — ignore case

`xargs -I@ ... @` injects each filename into the `sed` command. The `sed -i` flag edits files in place, and the trailing `g` applies the substitution globally per line.
