# Kyushu_2026_oct v5.3.52-r11.2

Changes:

- Fixes deployment cache-busting: index now requests app/style with r11.2 query keys and app registers sw.js with r11.2, so installed PWA/browser cannot stay on the old r11 renderer after upload.
- Booking PDF attachments keep the r11 in-app PDF preview behavior.
- Event cards no longer repeat the same place as both a store/stop row and an extra link chip below.
- When a duplicated explicit Google Maps link exists, the row-level `MAP` button now uses that exact URL.
- Truly extra links that are not represented by a stop row still render below the card.
- Firebase itinerary content is unchanged; continue using the current r11.4 content JSON.
