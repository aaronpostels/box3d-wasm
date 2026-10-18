# Release and publish

Status: nothing is published to npm. The daily job bumps the upstream submodule on `main` and creates a GitHub release. The npm publish is an open decision for the owner (section 3).

## 1. What runs today

`.github/workflows/ci.yml`, job `build`:

1. Checks out with submodules. On `schedule` and `workflow_dispatch` it runs `git submodule update --remote --merge vendor/box3d`.
2. Builds the three Emscripten flavours (SIMD, scalar, threads) in `emsdk:4.0.18` (Docker, GitHub only).
3. Runs `npm install`, `npm run build:ts`, `npm test`. `npm test` covers `test/smoke.mjs`, `test/snapshot.mjs` and `test/threads.mjs`, so the threads build is tested in CI without a workflow edit.
4. Uploads `dist/` as the artifact `box3d-wasm-dist`.

Job `update-upstream` runs only on `main`, only on a schedule or dispatch, and only when the submodule changed. It commits the new submodule SHA as `chore(vendor): bump upstream box3d to <sha>`, pushes to `main`, and runs `gh release create box3d-<short sha>` with the three wasm files.

## 2. Forced upstream bump (dry run, no publish)

Use this to test the bump path against a fake upstream change. Nothing here pushes to `main` or creates a release.

### 2a. Local, fully offline (checked 2026-10-18 with a bare copy of the vendor clone)

Uses a bare repo as a fake upstream. Nothing leaves the machine. The `git clone --bare` source below is the real upstream URL; use the local `vendor/box3d` clone instead if you want no network at all.

```bash
FAKE=/path/to/scratch
git clone --bare https://github.com/erincatto/box3d.git "$FAKE/fake-upstream.git"
git clone "$FAKE/fake-upstream.git" "$FAKE/fake-work"
cd "$FAKE/fake-work" && echo "// fake upstream change" >> FAKE_CHANGE.txt \
  && git add -A && git commit -m "fake upstream change" && git push origin HEAD:refs/heads/main

git clone /path/to/box3d-wasm "$FAKE/dryrun" && cd "$FAKE/dryrun"
git submodule update --init --reference /path/to/box3d-wasm/.git/modules/vendor/box3d vendor/box3d
git config -f .gitmodules submodule.vendor/box3d.url "$FAKE/fake-upstream.git"
git submodule sync
git submodule update --remote --merge vendor/box3d
git -C vendor/box3d rev-parse HEAD          # must print the fake commit
git diff --quiet vendor/box3d || echo changed=true   # the workflow's "changed" flag
```

Expected: the submodule moves to the fake SHA and `changed=true`. The build steps (`docker run ... scripts/build.sh`) need Docker or the emsdk; run them in CI or on a machine with emsdk. Locally, `npm run build:ts` and `node test/threads.mjs` need a `dist/` from a build.

Delete the scratch folder afterwards.

### 2b. On GitHub, with a fake upstream fork

1. Fork `erincatto/box3d` to a throwaway repo, push one fake commit to its `main`.
2. On a throwaway branch of this repo (never `main`), point `.gitmodules` at the fork: `submodule.vendor/box3d.url`.
3. Push the branch and dispatch the workflow on it:
   `gh workflow run ci.yml --ref <throwaway-branch>`
4. The `build` job pulls the fork's commit. `update-upstream` is skipped because the ref is not `main`, so no commit, push or release happens.
5. Read the run log for the "Record Tested Submodule SHA" step, then delete the branch and the fork.

Do not dispatch on `main` to test. That runs the real push and release.

## 3. npm publish: options for the owner

Decide these before any publish. Nothing below is implemented.

### 3a. Package name

Fact checked 2026-10-18: the unscoped name `box3d-wasm` is already on npm, version 0.2.0, maintained by another person (`monteslu`), from another repository. This repo cannot publish under it.

| Option | Trade-off |
|---|---|
| `@aaronpostels/box3d-wasm` (scoped, public) | Recommended. Owned by the user's npm scope, no clash. Needs `publishConfig.access: "public"`. The name is free as of the check, re-check before publishing. |
| A new unscoped name | Possible, but it has to be checked and picked, and it can read as a rival of the existing package. |
| No npm, keep `npm i github:aaronpostels/box3d-wasm` | No cost, no npm account needed. Consumers get no semver ranges or lockfile-friendly versions. The README already documents this path. |

### 3b. Versioning against upstream

| Option | Trade-off |
|---|---|
| Own semver in `package.json` (0.x.y), bumped by the owner per release. Upstream SHA in the release notes and in the build info. | Recommended. Stable version numbers for consumers. The mapping to upstream is in the notes, not in the version. |
| Encode the upstream tag in the version (upstream `v0.1.0` plus 40 commits gives `0.1.0-40.efca0c1`) | Traceable, but breaks when upstream tags change, and it ties our release cadence to theirs. |
| Auto-publish every daily bump as `0.x.y-next.YYYYMMDD` on a `next` dist-tag | Useful for early testers. Many versions, and npm restricts unpublishing after 72 hours. Only after the bump has run green once (README: it has not yet). |

### 3c. Provenance

| Option | Trade-off |
|---|---|
| `npm publish --provenance` from GitHub Actions with `id-token: write` | Recommended. Signed link from the tarball to this repo and commit. The repo is public, so it works. |
| Plain `npm publish` from a laptop | Simplest, no provenance. Not recommended for a wasm binary people will load. |

### 3d. Authentication

| Option | Trade-off |
|---|---|
| npm trusted publishing (OIDC from the workflow) | Recommended. No long-lived token in secrets. Set up once on npmjs.com for this repo and workflow file. |
| Long-lived `NPM_TOKEN` secret | Works everywhere, but a leaked token can publish. Use an automation token scoped to the package if this is the choice. |

### 3e. Who runs it

| Option | Trade-off |
|---|---|
| Owner, manual `workflow_dispatch` of a `publish` job guarded by a protected `npm` environment with required reviewer | Recommended. A human approves each version. The daily job stays bump-and-release only. |
| Daily cron publishes automatically when the bump is green | Fully hands-off. Publishes each upstream change, including breaking ones, under the owner's name. Wait until a real bump has run green. |

### 3f. Recommendation

Scoped name `@aaronpostels/box3d-wasm`, own semver with the upstream SHA in the release notes, provenance on, trusted publishing, a manual `publish` job behind a protected `npm` environment. Do the first publish from a dispatch on a release commit after the dry run in section 2 has passed.

## 4. Pre-publish checklist (any option)

- `npm run build` in CI (all three flavours), then `npm test` green, including `test/threads.mjs`.
- `npm pack --dry-run` lists only the `files` entries. Check that `dist/` contains the three `.js`/`.wasm` pairs and `index.d.ts`.
- `version` in `package.json` bumped. Release notes name the upstream SHA.
- README status line updated (it still lists npm publish as not done).
