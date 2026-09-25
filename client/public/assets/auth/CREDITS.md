# Sign-in page photos

Used by `client/src/pages/auth/AuthLayout.jsx` (the photo panel on PC screens; phones don't load
them). Each photo was downloaded at its original size from Pexels, cropped to 4:5 and exported with
sharp (Lanczos resize, no sharpening or smoothing) at three widths: AVIF (served first) and WebP
quality 85 (fallback).

All photos are from Pexels under the [Pexels License](https://www.pexels.com/license/): free to
use, including commercially, with no attribution required. We credit the photographers here anyway.

| Photo | Used on | Photographer | Original | Licence |
|---|---|---|---|---|
| [Smiling family on a sofa](https://www.pexels.com/photo/3-women-and-man-sitting-on-brown-wooden-bench-9346147/) → `family-portrait-*` | Sign in, Accept invite, Create your family | [Anna Pou](https://www.pexels.com/@anna-pou/) | 3788×4952 | Pexels License (free) |
| [Couple going through paperwork at home](https://www.pexels.com/photo/woman-massging-her-husband-4308016/) → `couple-paperwork-*` | Create account, Forgot password, Reset password | [Ketut Subiyanto](https://www.pexels.com/@ketut-subiyanto/) | 5734×3823 | Pexels License (free) |

Checked on 26 September 2026: both photo pages show "License: Free" and link to the Pexels License.

## Files

| File | Size | | File | Size |
|---|---|---|---|---|
| `family-portrait-1200.avif` (1200×1500) | 116 KB | | `family-portrait-1200.webp` | 199 KB |
| `family-portrait-1920.avif` (1920×2400) | 292 KB | | `family-portrait-1920.webp` | 538 KB |
| `family-portrait-2880.avif` (2880×3600) | 675 KB | | `family-portrait-2880.webp` | 1412 KB |
| `couple-paperwork-1200.avif` (1200×1500) | 57 KB | | `couple-paperwork-1200.webp` | 123 KB |
| `couple-paperwork-1920.avif` (1920×2400) | 135 KB | | `couple-paperwork-1920.webp` | 340 KB |
| `couple-paperwork-2880.avif` (2880×3600) | 272 KB | | `couple-paperwork-2880.webp` | 818 KB |

AVIF quality is 56 (52 for the 2880 files), which looked the same as WebP 85 side by side at 100%.
The browser picks one file by screen width and pixel density (`sizes="50vw"`): a 1280px PC screen
loads the 1200 file, a 1280px retina screen the 1920 file, a large retina screen the 2880 file.
