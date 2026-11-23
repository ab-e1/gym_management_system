---
title: "Every service call takes the gym id first, so tenant scoping cannot be skipped"
author: Ab-e1
date: 2026-11-11
standing: true
id: l-734fadf5
scope: repo
status: active
src: init-sessions
---

## Decided

- Multi-tenancy would otherwise rely on each controller remembering to filter by gym. Making the tenant a required leading argument moves that guarantee into the type signatures, and the auth middleware fills it in once.
- In the code: Service functions take gymId as their first parameter and filter every query on it (including joined users and membershipPlans via gymId plus isDeleted false). Keep that signature on new services and read the tenant only from the auth middleware, never from request body or params.

_From past Claude sessions here, Oct 6._
