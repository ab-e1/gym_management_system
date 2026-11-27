---
title: A membership deliberately includes the purchase day as a free extra day
author: Ab-e1
date: 2026-11-26
branch: main
cost: { minutes: 1, tokens: 2333 }
id: l-eecb8db3
scope: repo
status: active
src: agent
touches:
  - src/services/membership.service.ts
  - src/services/enrollment.service.ts
---

## Decided
- An N-day plan ends at 23:59 on the Nth day after the purchase day, so the rest of the purchase day is a free extra (a 30-day plan bought on March 1 ends March 31, 23:59). The owner chose this on purpose: it costs the gym nothing and gives the member a day to get started.
- Every path that creates a membership (renewal and enrollment) uses the same two rules, so a returning member's paid days are never lost: the new membership starts when their current one ends.
## Watch out
- "End of day" uses the server's timezone. On a UTC server a membership ends at 02:59 Addis Ababa time; running the process with TZ=Africa/Addis_Ababa fixes it.
- Archiving a member does not cancel their memberships, so re-enrolling an archived member must stack, not start from the enrollment date.
In the code: src/services/membership.service.ts (resolveMembershipStartDate, calculateMembershipEndDate), used by createMembership and src/services/enrollment.service.ts.
