# Deploy guide — fixing the failed "Unpack RaktFlow V3" run (2026-08-28)

## Why run #10 failed

- The ZIP in the repo was **valid** (SHA-256 matched the deliverable; all 156 files extracted).
- The failing step was **"Save extracted source"** (`git commit + git push`), not the unpack.
- Cause: the ZIP contained `.github/workflows/render-deploy.yml`. GitHub's `GITHUB_TOKEN`
  **cannot create or modify workflow files in a push**, so the commit that tried to *add*
  that new workflow file was rejected. (Yesterday's runs succeeded because that file did not
  exist yet; deletions of workflow files are allowed, which is why the script can delete
  `ci.yml`/`keep-warm.yml`.)

## Immediate fix (no new ZIP upload needed — the code in the repo is already final)

1. GitHub → repo → `.github/workflows/unpack.yml` → ✏️ edit → **replace the whole file with
   the content below** → Commit changes (use your own account via the web UI, which is allowed
   to modify workflows).
2. GitHub → **Actions → "Unpack RaktFlow V3" → Run workflow → main** → wait for green.
3. Vercel auto-deploys the new frontend from that push. Fully close + reopen the tab, then test.
4. Optional (recommended): after step 2, add `keep-warm.yml` back via web UI (content below) —
   it keeps the free Render service awake. Every future unpack deletes it again, so either
   re-add it after each unpack or use an external monitor (cron-job.org / UptimeRobot, free).
5. Optional: delete the stray 0-byte `Rakt-Flow` file at the repo root.

## Also recommended: Render auto-deploy (no more manual deploys)

- Edit `render.yaml` in the repo via web UI → `autoDeploy: false` → **`autoDeploy: true`**.
- Render dashboard → `raktflow-api` → **Deploy → Deploy latest commit** (once — this applies the
  new blueprint, including `autoDeploy`). From then on, every push to `main` rebuilds the API.

---

### Corrected `unpack.yml` (paste over the existing file)

```yaml
name: Unpack RaktFlow V3

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  unpack:
    runs-on: ubuntu-latest

    steps:
      - name: Download repository
        uses: actions/checkout@v6

      - name: Extract RaktFlow source
        run: |
          ZIP_FILE="$(find . -maxdepth 1 -type f -iname '*.zip' | head -n 1)"
          if [ -z "$ZIP_FILE" ]; then
            echo "No ZIP file found in the repository root."
            exit 1
          fi
          echo "Extracting: $ZIP_FILE"
          unzip -o "$ZIP_FILE" -d .
          rm "$ZIP_FILE"

          # GitHub's GITHUB_TOKEN cannot create or modify workflow files in a
          # push, so every workflow file inside the archive (except this one)
          # is removed before the commit. Re-add keep-warm via the web UI after
          # an unpack, or use an external monitor (cron-job.org / UptimeRobot).
          find .github/workflows -type f -name '*.yml' ! -name 'unpack.yml' -delete 2>/dev/null || true

      - name: Save extracted source
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "Nothing new to commit."
            exit 0
          fi
          git commit -m "Unpack RaktFlow V3 source"
          git push
```

### `keep-warm.yml` (web UI → Add file → `.github/workflows/keep-warm.yml`, paste; no secret needed)

```yaml
name: API warm-up (keeps the free Render service awake)
on:
  schedule:
    - cron: '*/14 * * * *'
  workflow_dispatch:
permissions: {}
concurrency:
  group: raktflow-warm-up
  cancel-in-progress: true
jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Bounded health probe
        env:
          HEALTH_URL: ${{ secrets.RENDER_HEALTH_URL || 'https://raktflow-api.onrender.com/api/v1/health' }}
        run: |
          curl --fail --silent --show-error --head \
            --max-time 20 --retry 1 --retry-delay 2 "$HEALTH_URL" \
            && echo "API warm." || echo "API unreachable (woken on next request)."
```

---

## The new deliverable (for the NEXT version upload)

`RaktFlow_v3_3_1_Editable.zip` — SHA-256 `0896f88aca6835dc984652d31791a6cbf3ae8cb9bff2d0716d958008602ac388`

This archive contains **no `.github/workflows/` files** (so the unpack commit never touches
workflow files again) and ships `render.yaml` with **`autoDeploy: true`**.
