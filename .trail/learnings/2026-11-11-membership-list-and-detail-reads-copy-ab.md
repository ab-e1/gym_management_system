---
title: Membership list and detail reads copy the same join and expiry rules
author: Ab-e1
date: 2026-11-11
standing: true
id: l-bd53645c
scope: repo
status: active
src: init-sessions
---

## Watch out
- Both read paths hand-write identical joins and the identical endDate expiry check. Changing the rule in one place leaves the other stale, and the two endpoints then report different statuses for the same membership.
- In the code: getAllMemberships and getMembershipById in the membership service duplicate the users + membershipPlans inner joins (scoped by gymId, isDeleted false) and the endDate expiry check. Extract a shared select/join builder plus a status helper and have both call it.

_From past Claude sessions here, Oct 6._
