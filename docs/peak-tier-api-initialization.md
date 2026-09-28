# Peak tier initialization from Riot

The member management page provides a staff-only button to initialize missing peak tiers from current solo-queue rank. Riot's League-V4 endpoint does not return all-time peak rank. The UI explicitly identifies the automatic value as an initial value; staff can correct historical records afterward.

- Read registered Riot accounts through the existing `withApiPuuid` helper and shared request limiter. If a member has no registered account, an explicit `Member.riotId` is resolved through ACCOUNT-V1; nicknames are never guessed.
- All connected accounts must succeed before saving the highest current solo rank. Errors do not become `UNRANKED`. Unauthorized, rate-limited and unavailable responses stop the browser's sequential batch.
- Preserve the upstream `MemberTier` enum, including its master LP bands. Exact Challenger/Grandmaster titles are not introduced by this change. Neither rated tier nor internal MMR is changed.
- Persist `peakTierInitializedAt` once. Manual changes, including choosing `UNRANKED`, set `peakTierManual`. Either marker prevents future API initialization. Existing non-unranked peaks are marked manual by the migration; legacy `UNRANKED` rows have no historical provenance and are considered eligible until edited.
- Compare the original member revision and connected-account identity before saving. Concurrent edits or account transfers reject the response. Member linking carries the provenance with the peak value.

Apply Prisma migrations and regenerate the client before starting the updated dashboard. Use the existing server-side `RIOT_API_KEY`; no browser-visible key is added. This migration targets the upstream schema, not the separate local prototype whose `peakTier` is a nullable string.

The patch also narrows the draw candidate helper's input type to the two fields it consumes, fixing the upstream TypeScript fixture mismatch without changing runtime behavior.
