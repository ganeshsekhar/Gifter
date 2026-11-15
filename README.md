# Our Wishlist

A private gift-idea list for two. Free to run:

- **Page**: one static file (`index.html`) on GitHub Pages.
- **Data**: a Google Sheet in your Google account.
- **Glue**: a small Google Apps Script (`apps-script/Code.gs`) that reads/writes the Sheet and
  fetches the title, picture and price from product links.

## How private is it?

- The page itself is public (GitHub Pages on a free account needs a public repo), but it contains no data.
- The data lives in your Google Sheet, which stays private to your Google account.
- The backend only answers requests carrying your shared passcode.
- The passcode is saved in each phone/laptop browser after first sign-in. Pick a long one; there is no
  lock-out on wrong guesses.

## Setup (about 10 minutes, once)

### 1. Google Sheet + backend

1. Create a new Google Sheet (any name, e.g. "Wishlist").
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the sample code, paste in everything from `apps-script/Code.gs`.
4. Change `const PASSCODE = 'CHANGE-ME';` to your own passcode. Save.
5. **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, approve the permissions Google asks for (it is your own script), and copy the
   **Web app URL** (ends in `/exec`).

### 2. Connect the page

Open `index.html`, find this line near the top and paste the URL between the quotes:

```js
const API_URL = '';
```

### 3. Put it on GitHub Pages

1. Create a public GitHub repo and push `index.html` (the repo may also hold `README.md` and
   `apps-script/Code.gs` — the copy here has only the placeholder passcode).
2. Repo **Settings → Pages → Deploy from a branch → main / (root)**.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

### 4. Share

Send your wife the link and the passcode. Each of you signs in once with your own name.
On a phone: browser menu → **Add to Home Screen** to get an app icon.

## Using it

- **Add item** → paste a product link. Title, picture and price fill in automatically when the shop
  allows it. Some shops (Amazon especially) block automatic lookups; then type a title and, if you
  want a picture, paste an image link (long-press / right-click the product photo → copy image address).
- Filter by **My wishes** / **her wishes** / **Everything**.
- **Mark bought** appears only on the other person's wishes, and the person who made the wish never
  sees it — so no spoiled surprises and no duplicate gifts.
- You can also open the Google Sheet directly to view or fix rows.

## Changing the backend later

After editing `Code.gs` in the Apps Script editor: **Deploy → Manage deployments → edit (pencil) →
Version: New version → Deploy**. The URL stays the same.
