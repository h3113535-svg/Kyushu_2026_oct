v5.3.7 Hero + Weather Interaction Cleanup

Cumulative from v5.3.6 Manual Weather Buddy.

Changes:
- Home Hero: normal tap is now intentionally inert. No speech bubble, no reaction animation, no spark burst.
- Home Hero: removed the rapid 5-tap easter egg. Swipe/dots still change the 5 Hero artworks. Long-press (~760 ms, move tolerance 11 px) remains the only Hero easter-egg trigger.
- This also removes the Hero tap transform collision that could make the centered artwork visibly jump to the right.
- Weather Buddy tap flow is now: tap -> switch to next outfit -> short pop-in -> new outfit speaks after ~150 ms.
- Weather Buddy no longer routes through the global buddyReact/global fixed speech bubble.
- Added a dedicated speech bubble anchored inside the Weather Card, immediately upper-left of the Weather Usagi.
- Rapid repeated weather taps cancel the previous pending bubble/timer, so only the currently visible outfit speaks.
- Weather dialogue data is now character-only; removed weather guidance subtitles from the source dialogue itself, not just CSS hiding.
- Manual weather artwork order remains: sunny -> teru-teru -> cloudy -> rain -> thunder -> snow -> sunny.
- Cache/version references aligned to 5.3.7 / v=537.

No Firebase migration required.
No private guide re-import required.
No image re-upload required if v5.3.6 weather assets are already deployed.
