/**
 * @OnlyCurrentDoc
 */
// The block above limits this script to the one Sheet it is attached to,
// instead of every spreadsheet in your Google account. Keep it as the first lines.

/**
 * Gifter backend — Google Apps Script bound to a Google Sheet.
 * The Sheet is the database. The web page (GitHub Pages) talks to this script.
 *
 * SETUP: fill in PEOPLE below, then Deploy > New deployment > Web app
 *        (Execute as: Me, Who has access: Anyone). See README.md.
 *        After any later edit: Deploy > Manage deployments > edit > New version.
 */

// One entry per person. The passcode decides who you are, so each person
// should know only their own. Names must match the names already used in the
// Items tab (column "addedBy"), otherwise older wishes will not show up.
// Edit this here in the Apps Script editor ONLY — never commit real values.
const PEOPLE = [
  { name: 'Person One', passcode: 'CHANGE-ME-1' },
  { name: 'Person Two', passcode: 'CHANGE-ME-2' },
];

const SHEET_NAME = 'Items';
const CLAIMS_NAME = 'Claims';   // hidden tab, so claims are not seen by accident
const HEADERS = ['id', 'url', 'title', 'image', 'price', 'note', 'addedBy', 'createdAt'];
const CLAIM_HEADERS = ['itemId', 'claimedBy'];

function doGet() {
  return json({ ok: true, message: 'Gifter backend is running.' });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const problem = configError();
    if (problem) {
      out = { ok: false, error: problem };
    } else {
      // Identity comes from the passcode alone; the page cannot claim to be someone else.
      const given = String(req.passcode || '');
      const i = PEOPLE[0].passcode === given ? 0 : PEOPLE[1].passcode === given ? 1 : -1;
      out = i < 0 ? { ok: false, error: 'unauthorized' } : handle(req, PEOPLE[i].name, PEOPLE[1 - i].name);
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return json(out);
}

function configError() {
  if (PEOPLE.length !== 2) return 'PEOPLE in Code.gs must list exactly two people.';
  const a = PEOPLE[0], b = PEOPLE[1];
  if (!clean(a.name, 40) || !clean(b.name, 40) || same(a.name, b.name)) return 'Give the two people different names in PEOPLE (Code.gs).';
  if (!a.passcode || !b.passcode || /^CHANGE-ME/.test(a.passcode) || /^CHANGE-ME/.test(b.passcode)) {
    return 'Passcodes not set yet. Edit PEOPLE in Code.gs and deploy a new version.';
  }
  if (a.passcode === b.passcode) return 'The two passcodes in PEOPLE must be different.';
  return '';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle(req, user, partner) {
  if (req.action === 'preview') return { ok: true, meta: fetchMeta(httpUrl(req.url)) };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (req.action === 'list') return { ok: true, me: user, partner: partner, items: listItems(user) };
    if (req.action === 'add') return addItem(req.item || {}, user);
    if (req.action === 'update') return updateItem(req.id, req.item || {}, user);
    if (req.action === 'delete') return deleteItem(req.id);
  } finally {
    lock.releaseLock();
  }
  return { ok: false, error: 'Unknown action.' };
}

/* ---------- Sheet storage ---------- */

function newTab(ss, name, headers) {
  const sh = ss.insertSheet(name);
  // Plain-text format so Sheets never reinterprets prices, ids or dates.
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function getSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const items = ss.getSheetByName(SHEET_NAME) || newTab(ss, SHEET_NAME, HEADERS);
  let claims = ss.getSheetByName(CLAIMS_NAME);
  if (!claims) {
    claims = newTab(ss, CLAIMS_NAME, CLAIM_HEADERS);
    migrateLegacyClaims(items, claims);
    claims.hideSheet();
  }
  return { items: items, claims: claims };
}

// Earlier versions kept "claimedBy" as column 9 of the Items tab. Move it out.
function migrateLegacyClaims(items, claims) {
  if (items.getLastColumn() < 9 || String(items.getRange(1, 9).getValue()).trim() !== 'claimedBy') return;
  const last = items.getLastRow();
  if (last >= 2) {
    const ids = items.getRange(2, 1, last - 1, 1).getValues();
    const who = items.getRange(2, 9, last - 1, 1).getValues();
    ids.forEach(function (r, i) {
      const id = String(r[0]).trim(), by = String(who[i][0]).trim();
      if (id && by) claims.appendRow([cell(id), cell(by)]);
    });
  }
  items.getRange(1, 9, last, 1).clearContent();
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

// itemId -> { by, row }
function readClaims(sh) {
  const map = {};
  const last = sh.getLastRow();
  if (last < 2) return map;
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r, i) {
    const id = String(r[0]).trim();
    if (id) map[id] = { by: String(r[1]).trim(), row: i + 2 };
  });
  return map;
}

function setClaim(sh, id, by) {
  const hit = readClaims(sh)[id];
  if (by) {
    if (hit) sh.getRange(hit.row, 1, 1, 2).setValues([[cell(id), cell(by)]]);
    else sh.appendRow([cell(id), cell(by)]);
  } else if (hit) {
    sh.deleteRow(hit.row);
  }
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
function publicItem(o, user, claimedBy) {
  const mine = same(o.addedBy, user);
  return {
    id: o.id, url: o.url, title: o.title, image: o.image, price: o.price, note: o.note,
    addedBy: o.addedBy, createdAt: Number(o.createdAt) || 0,
    claimed: mine ? false : !!claimedBy,
    claimedBy: mine ? '' : (claimedBy || '')
  };
}

function listItems(user) {
  const sh = getSheets();
  const claims = readClaims(sh.claims);
  return readAll(sh.items).filter(function (o) { return o.id; })
    .map(function (o) { return publicItem(o, user, claims[o.id] && claims[o.id].by); });
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
  getSheets().items.appendRow(toRow(o));
  return { ok: true, item: publicItem(o, user, '') };
}

function findRow(sh, id) {
  const all = readAll(sh);
  for (let i = 0; i < all.length; i++) {
    if (all[i].id && all[i].id === String(id)) return { row: i + 2, item: all[i] };
  }
  return null;
}

function updateItem(id, item, user) {
  const sh = getSheets();
  const hit = findRow(sh.items, id);
  if (!hit) return { ok: false, error: 'Item not found — it may have been deleted.' };
  const o = hit.item;
  if ('title' in item || 'url' in item) {
    const f = fields(item);
    if (!f.title && !f.url) return { ok: false, error: 'Add a link or a title.' };
    o.url = f.url; o.title = f.title; o.image = f.image; o.price = f.price; o.note = f.note;
    sh.items.getRange(hit.row, 1, 1, HEADERS.length).setValues([toRow(o)]);
  }
  // Edits never touch the claim; only the other person can set or clear it.
  if ('claimed' in item && !same(o.addedBy, user)) setClaim(sh.claims, o.id, item.claimed ? user : '');
  const claim = readClaims(sh.claims)[o.id];
  return { ok: true, item: publicItem(o, user, claim && claim.by) };
}

function deleteItem(id) {
  const sh = getSheets();
  const hit = findRow(sh.items, id);
  if (hit) {
    sh.items.deleteRow(hit.row);
    setClaim(sh.claims, hit.item.id, '');
  }
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
