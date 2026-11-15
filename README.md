# Gifter

A private gift wishlist for two. Free to run:

- **Page**: one static file (`index.html`) on GitHub Pages.
- **Data**: a Google Sheet in your Google account.
- **Glue**: a small Google Apps Script (`apps-script/Code.gs`) that reads/writes the Sheet and
  fetches the photo, title and price from product links.

## Features

- **Auto-filled product cards** — tap **+ Add idea**, paste a product link, and the photo, title and
  price fill in by themselves. Every field can be overridden, including a custom image link for
  stores that block lookups.
- **One profile per person** — each of you has your own passcode. The backend works out who you are
  from it, so there is no profile switcher and the page cannot ask for the other person's view.
- **Secret claiming** — on your partner's wishlist you can mark items **Claimed** and filter by
  **Available to Gift** or **Claimed by Me**. Claims on your own wishes are never sent to your
  devices. Editing an item keeps an existing claim.
- **Setup links** — connect one device, then copy a link for your partner or for your own other
  devices instead of pasting the script address again.

## How private is it?

- The repository holds no names, no passcodes and no link to your Sheet. The script address and
  your passcode are saved only in each browser.
- The data lives in your Google Sheet, which stays private to your Google account.
- The backend only answers requests carrying one of the two passcodes, which exist only inside
  your Apps Script. Pick long ones; there is no lock-out on wrong guesses.
- **Limit to know about:** whoever owns the Google Sheet and script can technically look inside
  them. Claims are kept in a hidden `Claims` tab so they are not seen by accident, and the
  passcodes are readable in the script. The other person has no such access.

## Setup (about 10 minutes, once)

### 1. Google Sheet + backend

1. Create a new Google Sheet (any name).
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the sample code and paste in everything from `apps-script/Code.gs`.
4. Fill in `PEOPLE` near the top: two names and two different passcodes. Save. (Do this only in the
   Apps Script editor — never commit real names or passcodes to this repo.)
5. **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, approve the permissions (they should mention only *this* spreadsheet and
   "connect to an external service"), and copy the **Web app URL** (ends in `/exec`).

### 2. Connect your device

Open the site, paste the web app URL, enter **your** passcode, **Connect**.

### 3. Your partner, and your other devices

**⚙ Settings → Add a device**:

- **Copy setup link for (partner)** — send it to them. It carries only the connection; they type
  their own passcode once. Give them their passcode separately.
- **Copy link for my other devices** — open it on your other phone or laptop. Tick "Include my
  passcode" for a one-tap sign-in; that link then signs in as you, so do not forward it.

Each browser stays signed in until you disconnect it or clear its site data.
On a phone: browser menu → **Add to Home Screen** to get an app icon.

## Upgrading from the shared-passcode version

1. Paste the new `Code.gs` over the old code and fill in `PEOPLE`. Use the same names you used
   before, so existing wishes stay attached to the right person.
2. **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays
   the same.
3. On each device, enter your own passcode when asked. Existing claims move to the hidden `Claims`
   tab automatically.

## Notes

- Some stores (Amazon especially) block automatic lookups. Then type a title and, for a photo,
  paste an image link (long-press / right-click the product photo → copy image address).
- After any later edit to `Code.gs`: **Deploy → Manage deployments → edit → New version → Deploy**.
- Hosting: repo **Settings → Pages → Deploy from a branch → main / (root)**.
