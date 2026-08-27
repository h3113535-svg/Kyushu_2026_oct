v5.3.5 Character Voice Pass

This release supersedes the uninstalled v5.3.4 candidate and is cumulative from v5.3.3.

Included from v5.3.4:
- iPhone long-press text-selection suppression while preserving text selection inside editable fields
- tentative choice -> explicit confirm -> clear/revert decision flow
- home hero reduced to 5 images with left/right swipe navigation
- softer semi-transparent "九州秋旅" header treatment
- Google Maps opens a place/search page instead of forcing directions
- weather character handling improvements using current assets (custom sunny/cloudy weather Usagi art is deferred)

v5.3.5 changes:
- character dialogue rewritten around character personalities
- Pompompurin: calm, soft, outing/snack/rest/friend-oriented full sentences
- Usagi: short vocalizations first; practical information is shown as separate app guidance text
- dialogue deck expanded to 603 entries across general, duo, weather, food, booking, shopping, money, notes, hotel, D1-D10, time-of-day and easter eggs
- Usagi expression swap supports more vocalization variants
- public app.js no longer contains named itinerary locations in day dialogue or category-matching code; private trip data remains Firebase-gated
- dialogue deck still shuffles without repetition until the current group is exhausted

No Firebase migration is required.
No private guide re-import is required.
Do not upload private guide JSON or private setup files to GitHub.

Weather-art follow-up is intentionally NOT included here. Continue that in the next session using HANDOFF_v5.3.5.md.
