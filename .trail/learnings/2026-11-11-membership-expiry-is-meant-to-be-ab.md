---
title: "Membership expiry is meant to be flipped by a cron job, not patched at read time"
author: Ab-e1
date: 2026-11-11
standing: true
id: l-e0989b3c
scope: repo
status: active
src: init-sessions
---

## Decided

- Reads currently reinterpret an active membership as expired once its end date passes, so the database and the API disagree. The agreed direction is a scheduled job writing the real status, with the read-time check only a stopgap until it lands.
- In the code: Membership status is stored as 'active' | 'expired' | 'cancelled'. Do not add more read-time derivation of 'expired' from endDate; treat the stored column as the source of truth and put expiry transitions in the cron job.

_From past Claude sessions here, Oct 6._
