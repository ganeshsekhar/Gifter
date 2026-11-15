/**
 * Wishlist backend — Google Apps Script bound to a Google Sheet.
 * The Sheet is the database. The web page (GitHub Pages) talks to this script.
 *
 * SETUP: change PASSCODE below, then Deploy > New deployment > Web app
 *        (Execute as: Me, Who has access: Anyone). See README.md.
 */

// Shared secret for you two. Change it here in the Apps Script editor ONLY.
// Do not commit your real passcode to the public GitHub repo.
const PASSCODE = 'CHANGE-ME';

const SHEET_NAME = 'Items';
const HEADERS = ['id', 'url', 'title', 'image', 'price', 'note', 'addedBy', 'createdAt', 'claimedBy'];

function doGet() {
  return json({ ok: true, message: 'Wishlist backend is running.' });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (PASSCODE === 'CHANGE-ME') {
      out = { ok: false, error: 'Backend passcode not set yet. Edit PASSCODE in Code.gs and redeploy.' };
    } else if (String(req.passcode || '') !== PASSCODE) {
      out = { ok: false, error: 'unauthorized' };
    } else {
      out = handle(req);
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return json(out);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle(req) {
  const user = clean(req.user, 40);
  if (!user) return { ok: false, error: 'Missing name.' };

  if (req.action === 'list') return { ok: true, items: listItems(user) };
  if (req.action === 'preview') return { ok: true, meta: fetchMeta(httpUrl(req.url)) };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (req.action === 'add') return addItem(req.item || {}, user);
    if (req.action === 'update') return updateItem(req.id, req.item || {}, user);
    if (req.action === 'delete') return deleteItem(req.id);
  } finally {
    lock.releaseLock();
  }
  return { ok: false, error: 'Unknown action.' };
}

/* ---------- Sheet storage ---------- */

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    // Plain-text format so Sheets never reinterprets prices, ids or dates.
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues().map(function (row) {
    const o = {};
    HEADERS.forEach(function (h, i) { o[h] = String(row[i]).trim(); });
    return o;
  });
}

function toRow(o) {
  return HEADERS.map(function (h) { return cell(o[h]); });
}

// Stop user text from being run as a spreadsheet formula.
function cell(v) {
  v = String(v == null ? '' : v);
  return /^[=+]/.test(v) ? ' ' + v : v;
}

function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function httpUrl(v) {
  v = clean(v, 2000);
  return /^https?:\/\//i.test(v) ? v : '';
}

function same(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// The person who wished for an item never learns whether it was claimed.
function publicItem(o, user) {
  const mine = same(o.addedBy, user);
  return {
    id: o.id, url: o.url, title: o.title, image: o.image, price: o.price, note: o.note,
    addedBy: o.addedBy, createdAt: Number(o.createdAt) || 0,
    claimed: mine ? false : !!o.claimedBy,
    claimedBy: mine ? '' : o.claimedBy
  };
}

function listItems(user) {
  return readAll(getSheet()).filter(function (o) { return o.id; })
    .map(function (o) { return publicItem(o, user); });
}

function fields(item) {
  return {
    url: httpUrl(item.url),
    title: clean(item.title, 200),
    image: httpUrl(item.image),
    price: clean(item.price, 40),
    note: clean(item.note, 500)
  };
}

function addItem(item, user) {
  const o = fields(item);
  if (!o.title && !o.url) return { ok: false, error: 'Add a link or a title.' };
  o.id = Utilities.getUuid();
  o.addedBy = user;
  o.createdAt = String(Date.now());
  o.claimedBy = '';
  getSheet().appendRow(toRow(o));
  return { ok: true, item: publicItem(o, user) };
}

function findRow(sh, id) {
  const all = readAll(sh);
  for (let i = 0; i < all.length; i++) {
    if (all[i].id && all[i].id === String(id)) return { row: i + 2, item: all[i] };
  }
  return null;
}

function updateItem(id, item, user) {
  const sh = getSheet();
  const hit = findRow(sh, id);
  if (!hit) return { ok: false, error: 'Item not found — it may have been deleted.' };
  const o = hit.item;
  if ('title' in item || 'url' in item) {
    const f = fields(item);
    if (!f.title && !f.url) return { ok: false, error: 'Add a link or a title.' };
    o.url = f.url; o.title = f.title; o.image = f.image; o.price = f.price; o.note = f.note;
  }
  // Edits never touch the claim; only the other person can set or clear it.
  if ('claimed' in item && !same(o.addedBy, user)) o.claimedBy = item.claimed ? user : '';
  sh.getRange(hit.row, 1, 1, HEADERS.length).setValues([toRow(o)]);
  return { ok: true, item: publicItem(o, user) };
}

function deleteItem(id) {
  const sh = getSheet();
  const hit = findRow(sh, id);
  if (hit) sh.deleteRow(hit.row);
  return { ok: true };
}

/* ---------- Link preview (title / image / price from the product page) ---------- */

function fetchMeta(url) {
  if (!url) return {};
  try {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (res.getResponseCode() >= 400) return {};
    return extractMeta(res.getContentText().slice(0, 1500000), url);
  } catch (err) {
    return {};
  }
}

function extractMeta(html, url) {
  const meta = parseMetaTags(html);
  const product = findProductJsonLd(html) || {};
  const first = function (re) { const m = html.match(re); return m ? decodeEntities(m[1]).trim() : ''; };

  const title = meta['og:title'] || meta['twitter:title'] || str(product.name) ||
    first(/id=["']productTitle["'][^>]*>([^<]+)</i) || first(/<title[^>]*>([^<]*)<\/title>/i);

  const image = meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] ||
    meta['twitter:image:src'] || imageOf(product.image) ||
    first(/data-old-hires=["'](https?:[^"']+)["']/i) ||
    first(/"hiRes"\s*:\s*"(https?:[^"]+)"/i) ||
    first(/id=["']landingImage["'][^>]*\bsrc=["']([^"']+)["']/i);

  let price = '';
  const amount = meta['product:price:amount'] || meta['og:price:amount'];
  const currency = meta['product:price:currency'] || meta['og:price:currency'] || '';
  if (amount) {
    price = (currency + ' ' + amount).trim();
  } else if (product.offers) {
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (offer && (offer.price || offer.lowPrice)) {
      price = ((offer.priceCurrency || '') + ' ' + (offer.price || offer.lowPrice)).trim();
    }
  }

  return {
    title: clean(title.replace(/\s+/g, ' '), 200),
    image: httpUrl(absolutize(image, url)),
    price: clean(price, 40)
  };
}

function parseMetaTags(html) {
  const map = {};
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(function (tag) {
    const attrs = {};
    const re = /([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] || m[3] || m[4] || '';
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content && !(key in map)) map[key] = decodeEntities(attrs.content).trim();
  });
  return map;
}

function findProductJsonLd(html) {
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const hit = findProduct(JSON.parse(m[1]), 0);
      if (hit) return hit;
    } catch (err) { /* malformed JSON-LD: skip */ }
  }
  return null;
}

function findProduct(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findProduct(node[i], depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'Product' || (Array.isArray(type) && type.indexOf('Product') >= 0)) return node;
  return findProduct(node['@graph'], depth + 1) || findProduct(node.mainEntity, depth + 1);
}

function imageOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return imageOf(v[0]);
  return str(v.url || v.contentUrl);
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

function absolutize(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  const origin = (String(base).match(/^https?:\/\/[^\/?#]+/i) || [''])[0];
  if (!origin) return '';
  return u.charAt(0) === '/' ? origin + u : origin + '/' + u;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
