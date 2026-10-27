# Roadmap

BrickForge covers collecting, valuing, scanning, and selling, on Windows and macOS. These are the ideas being considered next. None of them is promised or scheduled; open an [issue](https://github.com/jaig-eye/brickforge/issues) to argue for one or suggest another.

## Feature Proposals

### Signed builds
Sign the Windows installer, and sign and notarize the Mac app with an Apple Developer ID.
- **Why:** SmartScreen and Gatekeeper warnings are the biggest hurdle for new users, and a signed Mac app can update itself like the Windows one.
- **Needs:** a Windows code-signing certificate, an Apple Developer membership, and signing steps in the release workflow.

### More price regions and currencies
Let you choose BrickLink's region (Europe, Asia, and so on) and show values in your currency.
- **Why:** prices are US sales in US dollars today, which is off for collectors elsewhere.
- **Needs:** region and currency settings, and a re-price when they change.

### Push a wishlist to BrickLink
Export the wishlist as a BrickLink wanted list, so you can buy what's missing in one go.
- **Why:** the import side already reads wanted-list XML; this closes the loop.
- **Needs:** XML export with condition and maximum price per item.

### Parts inventory
Track loose pieces and see which sets and minifigures you could build from what you own.
- **Why:** a common ask from builders, not just collectors, and a way to find figures worth assembling to sell.
- **Needs:** a parts table, part lists per set and per minifigure, and a way to count pieces that isn't tedious, such as importing a BrickLink store inventory. Cut from 1.0 because adding parts by hand was too much work.

### Part-out value
For each minifigure, compare its price whole with the sum of its parts on BrickLink.
- **Why:** sellers decide between selling a figure whole and parting it out.
- **Needs:** each figure's parts list and part prices from BrickLink.

### Linux builds
Package BrickForge as an AppImage.
- **Why:** nothing in the app ties it to Windows or macOS.
- **Needs:** test runs on Linux in CI.

### iPhone and iPad companion
A phone app for scanning on the go and checking prices in a store.
- **Why:** the camera is on the phone, and so is the shelf in the store.
- **Needs:** a separate app (Electron builds desktop apps only), sync to share the collection, and an Apple Developer membership to distribute it.

### Collection sharing
Publish a read-only page of your collection or wishlist to share with friends.
- **Why:** collectors like to show off and to send wishlists before birthdays.
- **Needs:** a static export, or hosting tied to the optional sync database.
