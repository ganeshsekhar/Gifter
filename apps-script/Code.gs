/**
 * @OnlyCurrentDoc
 */
// The block above limits this script to the one Sheet it is attached to,
// instead of every spreadsheet in your Google account. Keep it as the first lines.

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
const HEADERS = ['id', 'url', 'title', 'image', 'price', 'note', 'addedBy', 'createdAt', 'claimedBy', 'category', 'need'];

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
  } else if (String(sh.getRange(1, HEADERS.length).getValue()).trim() !== HEADERS[HEADERS.length - 1]) {
    // Sheet made by an older version: add the newer column headings.
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
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
    id: o.id, url: o.url, title: o.title, image: o.image, price: o.price, note: o.note, category: o.category,
    need: Math.min(5, Math.max(1, Math.round(Number(o.need)) || 1)),   // 1 = want … 5 = need
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
    note: clean(item.note, 500),
    category: clean(item.category, 30),
    need: String(Math.min(5, Math.max(1, Math.round(Number(item.need)) || 1)))
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
    o.url = f.url; o.title = f.title; o.image = f.image; o.price = f.price; o.note = f.note; o.category = f.category; o.need = f.need;
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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9'
};

function fetchMeta(url) {
  if (!url) return {};
  let meta = {};
  let pageUrl = url;
  try {
    if (isAmazon(url)) pageUrl = resolveRedirects(url);     // amzn.in/d/… short links -> full product link
    const res = UrlFetchApp.fetch(pageUrl, { muteHttpExceptions: true, followRedirects: true, headers: FETCH_HEADERS });
    const html = res.getContentText().slice(0, 1500000);
    if (res.getResponseCode() < 400 && !looksBlocked(html)) meta = extractMeta(html, pageUrl);
  } catch (err) { /* fall through to the fallbacks below */ }
  if (isAmazon(pageUrl)) meta = amazonFallback(meta, pageUrl);
  return meta;
}

function isAmazon(url) {
  return /^https?:\/\/([a-z0-9-]+\.)*(amazon\.[a-z.]{2,6}|amzn\.[a-z]{2,3}|a\.co)\//i.test(url);
}

// A "prove you are not a robot" page instead of the product.
function looksBlocked(html) {
  return /api-services-support@amazon\.com|validateCaptcha|Enter the characters you see below/i.test(html) ||
    (html.length < 20000 && /captcha/i.test(html));
}

function resolveRedirects(url) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = UrlFetchApp.fetch(current, { muteHttpExceptions: true, followRedirects: false, headers: FETCH_HEADERS });
    const code = res.getResponseCode();
    const headers = res.getHeaders();
    const next = httpUrl(absolutize(headers['Location'] || headers['location'], current));
    if (code < 300 || code >= 400 || !next) break;
    current = next;
  }
  return current;
}

// Amazon often refuses automated page lookups. The product ID in the link is
// still enough to get the main photo, and the link text usually holds the name.
function amazonFallback(meta, url) {
  const id = url.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?:[\/?#]|$)/i);
  if (!id) return meta;
  if (!meta.image) {
    const img = 'https://m.media-amazon.com/images/P/' + id[1].toUpperCase() + '.01._SCLZZZZZZZ_SX600_.jpg';
    if (isRealImage(img)) meta.image = img;
  }
  if (!meta.title) {
    const slug = url.match(/amazon\.[a-z.]+\/([^\/?#]+)\/dp\//i);
    if (slug) {
      try { meta.title = clean(decodeURIComponent(slug[1]).replace(/[-_+]+/g, ' '), 200); } catch (err) { /* odd encoding: skip */ }
    }
  }
  return meta;
}

// Unknown product IDs answer with a 1-pixel GIF rather than an error.
function isRealImage(url) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const headers = res.getHeaders();
    const type = String(headers['Content-Type'] || headers['content-type'] || '');
    return res.getResponseCode() === 200 && /^image\/(jpeg|png|webp)/i.test(type) && res.getContent().length > 1000;
  } catch (err) {
    return false;
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
  if (!price) price = first(/class=["']a-offscreen["'][^>]*>\s*([^<\s][^<]{0,30})</i);   // Amazon's price markup

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
