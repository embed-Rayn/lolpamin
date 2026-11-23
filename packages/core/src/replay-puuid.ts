const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A .rofl names its players by the unencrypted 36-char UUID; Riot API responses carry a
 * 78-char PUUID encrypted for the calling app. RiotAccount.puuid holds whichever source
 * created the row, so this tells a replay row from a name#tag registration. Compare against
 * apiPuuid instead and the test breaks the moment apiPuuid is re-fetched under another app's
 * key — the registered puuid keeps the old app's value.
 */
export function isReplayPuuid(puuid: string): boolean {
  return UUID.test(puuid);
}
