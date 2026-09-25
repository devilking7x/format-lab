# Contributing

Thanks for your interest! This project is beginner-friendly — even a small fix or typo correction is welcome.

## Ways to contribute

- **Found a bug?** Open an issue using the bug report template.
- **Have an idea?** Suggest it with the feature request template.
- **Docs need work?** Typos and clarifications make great first PRs.
- **Want to code?** See the dev setup below.

## Dev setup

```bash
npm install
npm run dev
```

Check the production build before submitting:

```bash
npm run build
```

## Pull request process

1. Fork the repo.
2. Create a branch: `git checkout -b fix/my-change`
3. Make your change and verify `npm run build` passes.
4. Open a PR with a clear description — what changed and why.

## Ground rules

- **Stay local-first.** Don't add network calls without discussing in an issue first.
- TypeScript + React, styled with Tailwind.
- Keep the bundle small — avoid heavy dependencies without a good reason.

## Questions?

Open an issue — no question is too small.
