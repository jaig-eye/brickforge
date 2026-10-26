# Roadmap

BrickForge 1.0 covers collecting, valuing, scanning, and selling. These are the ideas being considered next. None of them is promised or scheduled; open an [issue](https://github.com/jaig-eye/brickforge/issues) to argue for one or suggest another.

## Feature Proposals

### Signed installer
Sign the Windows installer so SmartScreen stops warning on first install.
- **Why:** the warning is the biggest hurdle for new users.
- **Needs:** a code-signing certificate and a signing step in the release workflow.

### More price regions and currencies
Let you choose BrickLink's region (Europe, Asia, and so on) and show values in your currency.
- **Why:** prices are US sales in US dollars today, which is off for collectors elsewhere.
- **Needs:** region and currency settings, and a re-price when they change.

### Push a wishlist to BrickLink
Export the wishlist as a BrickLink wanted list, so you can buy what's missing in one go.
- **Why:** the import side already reads wanted-list XML; this closes the loop.
- **Needs:** XML export with condition and maximum price per item.

### Parts inventory
Track loose pieces and see which sets you could build from what you own.
- **Why:** a common ask from builders, not just collectors.
- **Needs:** a parts table, Rebrickable part lists per set, and a way to count pieces that isn't tedious. Cut from 1.0 because adding parts by hand was too much work.

### macOS and Linux builds
Package BrickForge for macOS and Linux.
- **Why:** nothing in the app is Windows-specific apart from the installer.
- **Needs:** signing and notarization on macOS, and test runs on both systems in CI.

### Collection sharing
Publish a read-only page of your collection or wishlist to share with friends.
- **Why:** collectors like to show off and to send wishlists before birthdays.
- **Needs:** a static export, or hosting tied to the optional sync database.
