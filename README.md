# The wall

A public wall of designers who shipped their first pull request. Each card is one small file in
[`designers/`](designers), added by pull request, checked by a bot, and merged automatically when it's right.

This is the shared repo from Chapter 1 of *The Craft of Design Engineering*.

## Add your card

Everything happens here on github.com. No terminal, nothing to install.

1. Open the [`designers`](designers) folder and click **Add file → Create new file**.
2. Name the file after your GitHub username, all lowercase: `your-username.md`.
3. Paste this and fill it in:

   ```
   ---
   name: Your Name
   where: City, Country
   first-fix: One sentence about the first thing you want to fix in a product.
   link: https://your-portfolio.example
   ---
   ```

   `link` is optional. If a value contains a colon followed by a space, wrap it in double quotes.
4. Click **Commit changes…**, then **Propose changes**. GitHub makes your own copy of this repo (a fork) for you.
5. Click **Create pull request**.
6. The wall bot replies within a minute or two. If it flags something, fix it on your branch and it checks again.
   When everything passes, it merges, and your card appears on the wall a few minutes later.

The exact rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Changing or removing your card

- **Change it:** open your file in `designers/`, click the pencil, edit, and propose the change the same way.
- **Remove it:** [open an issue](../../issues/new/choose) and a maintainer will take it down.

## How the bot works

[`wall-check.yml`](.github/workflows/wall-check.yml) runs on every pull request. It reads your card's text
through GitHub's API and checks it with [`scripts/validate.mjs`](scripts/validate.mjs). It never runs anything
from a pull request. If the card passes, the bot merges exactly the commit it checked and asks
[`deploy.yml`](.github/workflows/deploy.yml) to rebuild the site on GitHub Pages.

## For maintainers

- `npm test` runs the rule tests. `npm run build` writes the site to `dist/`.
- Settings: the site URL and repo name live in `wall.config.json`.
- Pause auto-merge: set the repository variable `WALL_AUTOMERGE` to `off`. Cards still get checked; a person merges.
- Moderation lists in `moderation/`: blocked usernames, blocked link domains, and words that hold a card for a person.
- Take a card down: delete the file in a commit (`Remove card: <handle> (<reason>)`), and add the handle to
  `moderation/blocked-handles.txt` if it was abuse.
