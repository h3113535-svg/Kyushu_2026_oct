# Kyushu_2026_oct v5.3.52-r8

## App changes
- Targeted Hero suitcase-handle cleanup only: keeps alpha unchanged, replaces hidden white RGB inside the two transparent handle cutouts with the actual hero background color to prevent Android/compositor white leakage.
- Hero asset token bumped to `552r8`.
- Keeps r6 manual refresh/sync feature and all r7 functionality.

## Private content
- D3 LaLaport event adds `LaLaport鋼彈拍照點` with the supplied Google Maps link and performance schedule.
- Requires importing the accompanying Firebase Content JSON to `trips/kyushu-oct-2026/content`, then use Aa → 重新整理並同步.
