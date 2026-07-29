// Captures the inputs a tester types into the target application.
//
// Targets live under targets/<id>/app/ and are served from the same origin as
// this page, so we observe the iframe's document directly rather than
// instrumenting each target. The app under test stays untouched — no injected
// script, no modified markup.
//
// Listeners are delegated on the iframe document, so any number of fields
// (and fields created after load) are picked up without per-target config.

const DEBOUNCE_MS = 400;
const FIELD_SELECTOR = 'input, textarea, select';
const IGNORED_TYPES = new Set([
  'password', 'hidden', 'file', 'submit', 'button', 'reset', 'image'
]);

let entries = [];          // ordered list of captured values
let targetId = null;
let frame = null;
let doc = null;            // iframe document currently listened on
let onUpdate = null;
const pending = new Map(); // fieldKey -> debounce timer

// ── Field identity ───────────────────────────────────────────────────────────

// A stable-ish key so repeat values on the same field collapse together.
function fieldKey(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `[name=${el.name}]`;
  const siblings = [...el.ownerDocument.querySelectorAll(FIELD_SELECTOR)];
  return `${el.tagName.toLowerCase()}:nth(${siblings.indexOf(el)})`;
}

// Visible label, when the target provides one — useful later for reporting
// which field an input belongs to.
function fieldLabel(el) {
  if (el.id) {
    const lbl = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim().replace(/:$/, '');
  }
  const wrapping = el.closest('label');
  if (wrapping) return wrapping.textContent.trim().replace(/:$/, '');
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
}

function isCapturable(el) {
  if (!el || !el.matches || !el.matches(FIELD_SELECTOR)) return false;
  const type = (el.type || '').toLowerCase();
  return !IGNORED_TYPES.has(type);
}

function valueOf(el) {
  const type = (el.type || '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return String(el.checked);
  return el.value;
}

// ── Recording ────────────────────────────────────────────────────────────────

function persist() {
  if (!targetId) return;
  localStorage.setItem(`ctb-inputs-${targetId}`, JSON.stringify(entries));
  if (onUpdate) onUpdate(entries);
}

// `committed` marks a value that was actively submitted (button click, Enter,
// form submit) rather than merely typed — those are kept verbatim.
function record(el, committed) {
  const key = fieldKey(el);
  const value = valueOf(el);

  // An empty value only counts when deliberately submitted; "clicked Check
  // with an empty box" is itself a test worth keeping.
  if (!committed && value.trim().length === 0) return;

  const last = [...entries].reverse().find(e => e.key === key);

  if (last && last.value === value) {
    if (committed && !last.committed) last.committed = true;
    else return;
    persist();
    return;
  }

  // Mid-typing snapshots get superseded by what they grew into, so the log
  // holds the inputs actually tried rather than every keystroke burst.
  if (last && !last.committed && value.startsWith(last.value)) {
    last.value = value;
    last.at = Date.now();
    last.committed = committed;
    persist();
    return;
  }

  entries.push({
    key,
    label: fieldLabel(el),
    tag: el.tagName.toLowerCase(),
    type: (el.type || '').toLowerCase(),
    value,
    committed,
    at: Date.now()
  });
  persist();
}

function recordAllFields(committed) {
  if (!doc) return;
  for (const el of doc.querySelectorAll(FIELD_SELECTOR)) {
    if (isCapturable(el)) record(el, committed);
  }
}

function flush(key) {
  const timer = pending.get(key);
  if (timer) {
    clearTimeout(timer);
    pending.delete(key);
  }
}

// ── Event handlers (delegated, capture phase) ────────────────────────────────

function onInput(e) {
  const el = e.target;
  if (!isCapturable(el)) return;
  const key = fieldKey(el);
  flush(key);
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    record(el, false);
  }, DEBOUNCE_MS));
}

function onChange(e) {
  const el = e.target;
  if (!isCapturable(el)) return;
  flush(fieldKey(el));
  record(el, false);
}

// Anything that looks like "the tester submitted this" pins the current values.
function onCommit(e) {
  const el = e.target;
  if (e.type === 'keydown') {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (!isCapturable(el)) return;
  } else if (e.type === 'click') {
    const trigger = el.closest && el.closest('button, [type=submit], [type=button]');
    if (!trigger) return;
  }
  pending.forEach((_, key) => flush(key));
  recordAllFields(true);
}

function onBlur(e) {
  const el = e.target;
  if (!isCapturable(el)) return;
  flush(fieldKey(el));
  record(el, false);
}

const HANDLERS = [
  ['input', onInput],
  ['change', onChange],
  ['click', onCommit],
  ['keydown', onCommit],
  ['submit', onCommit],
  ['blur', onBlur]
];

function listen(document) {
  for (const [type, fn] of HANDLERS) document.addEventListener(type, fn, true);
}

function unlisten(document) {
  for (const [type, fn] of HANDLERS) document.removeEventListener(type, fn, true);
}

// ── Attachment ───────────────────────────────────────────────────────────────

// Re-attach on every load: the target may navigate within the frame.
const ATTACH_POLL_MS = 50;
const ATTACH_TIMEOUT_MS = 10000;
let attachTimer = null;

// null when the target's document isn't reachable: still about:blank, or the
// frame has navigated cross-origin.
function currentDoc() {
  try {
    const d = frame.contentDocument;
    if (!d || d.location.href === 'about:blank') return null;
    return d;
  } catch {
    return null;
  }
}

function tryAttach() {
  const candidate = currentDoc();
  if (!candidate) return false;
  if (candidate === doc) return true;
  if (doc) unlisten(doc);
  doc = candidate;
  listen(doc);
  // Confirms in the console that the current build is actually attached.
  console.info(`[ctb] capturing inputs for "${targetId}" — __ctb.inputs()`);
  return true;
}

// Waiting for the frame's `load` event is not enough: it fires only once every
// image, stylesheet and web font has settled, long after the form is usable.
// A tester typing in that window would have their input silently dropped, so
// poll for the document instead and attach the moment it exists.
function pollForDocument() {
  clearInterval(attachTimer);
  let waited = 0;
  attachTimer = setInterval(() => {
    waited += ATTACH_POLL_MS;
    if (tryAttach() || waited >= ATTACH_TIMEOUT_MS) {
      clearInterval(attachTimer);
      attachTimer = null;
    }
  }, ATTACH_POLL_MS);
}

function onFrameLoad() {
  // A load replaces the document, so drop the old listeners and re-attach.
  if (doc) {
    unlisten(doc);
    doc = null;
  }
  if (!tryAttach()) pollForDocument();
}

// Start capturing for `id`, restoring anything already recorded for it.
// Call before setting the iframe's src so the first load is observed.
export function startCapture(iframeEl, id) {
  stopCapture();
  frame = iframeEl;
  targetId = id;
  entries = JSON.parse(localStorage.getItem(`ctb-inputs-${id}`) || '[]');
  frame.addEventListener('load', onFrameLoad);
  if (!tryAttach()) pollForDocument();
  return entries;
}

export function stopCapture() {
  pending.forEach(timer => clearTimeout(timer));
  pending.clear();
  clearInterval(attachTimer);
  attachTimer = null;
  if (doc) unlisten(doc);
  if (frame) frame.removeEventListener('load', onFrameLoad);
  doc = null;
  frame = null;
}

export function onCapture(cb) {
  onUpdate = cb;
}

// True once listeners are live on the target's document. Attachment is
// asynchronous, so anything driving the app needs a way to wait for it.
export function isCapturing() {
  return Boolean(doc);
}

export function getCapturedInputs() {
  return entries;
}

// Distinct values a given field received, oldest first.
export function getCapturedValues(key) {
  return entries.filter(e => !key || e.key === key).map(e => e.value);
}

export function clearCapturedInputs() {
  entries = [];
  if (targetId) localStorage.removeItem(`ctb-inputs-${targetId}`);
  if (onUpdate) onUpdate(entries);
}
