# Gifter

A private gift wishlist for two. Free to run:

- **Page**: one static file (`index.html`) on GitHub Pages.
- **Data**: a Google Sheet in your Google account.
- **Glue**: a small Google Apps Script (`apps-script/Code.gs`) that reads/writes the Sheet and
  fetches the photo, title and price from product links.

## Features

- **Auto-filled product cards** — tap **+ Add Idea**, paste a product link, and the photo, title and
  price fill in by themselves. Every field can be overridden, including a custom image link for
  stores that block lookups.
- **Sort and filter** — by category (picked in the form, or guessed from the title), price range,
  newest/oldest, price and "most needed".
- **Want or need** — every idea carries a want-to-need slider, so the giver knows what matters most.
- **Currency switch** — show all prices in INR, USD, EUR or GBP. Converted prices are marked `≈` and
  use daily rates from the public frankfurter.dev service (only currency codes are sent). The saved
  price keeps its original currency.
- **Secret claiming** — on your partner's wishlist you can mark items **🎁 Claimed / Bought** and
  filter by **Available to Gift** or **Claimed by Me**. On your own wishlist no claim badges or
  filters exist, and the backend never sends claim data for your own items. Editing an item (note,
  size, price…) keeps an existing claim.
- **"I am" switcher** — one tap to switch between the two profiles on a shared device.
- **Magic setup link** — connect once, then send your partner a link that connects their browser
  and sets their profile.

## How private is it?

- The repository holds no names, no passcode and no link to your Sheet. All of that is typed into
  **Settings** and saved only in each browser.
- The data lives in your Google Sheet, which stays private to your Google account.
- The backend only answers requests carrying your shared passcode, which exists only inside your
  Apps Script. Pick a long one; there is no lock-out on wrong guesses.
- The "I am" switcher is a convenience, not a lock: anyone holding the passcode can pick either
  profile. Surprises rely on the two of you not peeking.

## Setup (about 10 minutes, once)

Anyone can use the hosted page at https://ganeshsekhar.github.io/Gifter/ with their own Google
Sheet — each couple's data stays in their own Sheet, and nothing is shared between couples.

### 1. Google Sheet + backend

1. Create a new Google Sheet (any name).
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the sample code and paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs)
   (open it and use the copy button at the top right of the code).
4. Change `const PASSCODE = 'CHANGE-ME';` to your own passcode. Save. (Change it only there — do
   not commit your real passcode to this repo.)
5. **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**. Google shows a **"Google hasn't verified this app"** warning — that is
   normal: it is your own script, run only by you, so Google has never reviewed it. Choose
   **Advanced → Go to (project name)**, then allow. It should ask only for *this* spreadsheet and
   "connect to an external service". Copy the **Web app URL** (ends in `/exec`).

### 2. Connect your device

Open the site, enter your name, your partner's name, the web app URL and the passcode, then
**Connect**.

### 3. Invite your partner

**⚙ Settings → 🔗 Copy Magic Setup Link**, and send it to them. Opening it connects their browser
and sets their profile. By default the link does not contain the passcode (they type it once); tick
"Include the passcode" for a one-tap setup, and then treat the link like the passcode itself.

On a phone: browser menu → **Add to Home Screen** to get an app icon.

## Install on your phone

- **Android (Chrome):** open the site and tap **Install** in the banner (or ⚙ Settings → This
  device → Install, or Chrome menu → *Add to Home screen* / *Install app*). Gifter then opens full
  screen from its own icon, and appears in the Android share sheet: in any shopping app tap
  **Share → Gifter** and the Add idea form opens with the link filled in.
- **iPhone (Safari):** Share → **Add to Home Screen**. iOS does not let web apps appear in the
  share sheet, so copy the product link and paste it into Add idea.
- The app shell opens without a connection; the list itself needs the internet to refresh.

## Notes

- Some stores (Amazon especially) block automatic lookups. Then type a title and, for a photo,
  paste an image link (long-press / right-click the product photo → copy image address).
- You can open the Google Sheet directly to view or fix rows. The `claimedBy` column there is not
  hidden, so the person being surprised should stay out of the Sheet.
- After editing `Code.gs` later: **Deploy → Manage deployments → edit (pencil) → Version: New
  version → Deploy**. The URL stays the same.
- Hosting: repo **Settings → Pages → Deploy from a branch → main / (root)**.
