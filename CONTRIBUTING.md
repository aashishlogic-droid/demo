# Card rules

The bot checks five things, in this order. Each failed check comes with a sentence saying how to fix it.

| Check | What passes |
|---|---|
| One file | The pull request adds or edits exactly one file, and nothing else. |
| Folder | The file is directly inside `designers/`. |
| Filename | It's named after the pull request author's GitHub username, lowercase, ending in `.md`. You can add your own card once and edit it later; you can't edit anyone else's. |
| Front matter | The file is a block between two `---` lines, with `name`, `where` and `first-fix` (and optionally `link`), each written as label, colon, space, value. Nothing after the closing `---`. |
| Length | `name` and `where`: 1 to 60 characters. `first-fix`: 10 to 140 characters. `link`: up to 200. |

Also:

- `link` is one `https://` address of your own page: no shortened links, no `?` or `#` parts.
- No links, email addresses or `<` `>` in `name`, `where` or `first-fix`.
- Plain text only: no hidden or control characters.
- Some cards are held for a person to look at before they go up. That isn't a rejection.

Be kind, use your real name or handle, and keep it about the work. Cards that are ads, spam or harassment are removed.
