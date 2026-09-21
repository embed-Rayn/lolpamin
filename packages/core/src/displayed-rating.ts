/**
 * The rating a dashboard shows for a member. A member who has no counted game in
 * the mode still carries the default rating (1000) underneath, so their first
 * game is scored from it, but the board shows 0 until they have actually played:
 * a row full of untouched 1000s would rank above everyone who lost a game.
 */
export function displayedRating(rating: number, playedCount: number): number {
  return playedCount === 0 ? 0 : rating;
}
