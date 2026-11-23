---
title: "The API runs on Hono, not Express and not a raw Bun server"
author: Ab-e1
date: 2026-11-11
standing: true
id: l-5859821e
scope: repo
status: active
src: init-sessions
---

## Decided

- The project's own guidance only banned Express, which left the HTTP layer ambiguous. The team settled on Hono as the idiomatic choice on Bun, so the question is closed rather than reopened every review.
- In the code: Framework is Hono served by Bun. There is no Express anywhere and no Bun.serve() handler to move code into. When adding endpoints, extend the existing Hono router under the API app and keep the route -> middleware -> controller -> service split.

_From past Claude sessions here, Oct 6._
