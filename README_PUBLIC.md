# Kyushu_2026_oct v5.3.52-r11

Changes:
- Booking PDF attachments now try to open inside the app first using an embedded PDF object with iframe compatibility fallback.
- PDF blobs restored from IndexedDB are normalized to `application/pdf` when needed.
- “Open new page” remains only as a fallback (`新分頁備用`).
- Existing r10 features and local booking attachments are preserved.
- Firebase itinerary content is supplied separately because D3 Hakata shopping flow was reorganized.
