/**
 * SweepRight — Quote Builder (production upgrade)
 * Internal tool · Sales & Owner views
 */

'use strict';

/* ─────────────────────────────────────────────────
   CENTRAL CONFIG  — edit rates / add-ons here only
───────────────────────────────────────────────── */

const CONFIG = {
  buffer:      10,   // % auto-applied to all quotes
  minJobValue: 100,  // £ minimum per-visit charge

  contactPhone: '+44 7425 583734',
  contactEmail: 'cleaners@sweeprightcleaning.com',

  // Smart sq-ft recommendation thresholds
  sqftRecs: [
    { maxSqft: 1000,      cleaners: 1, hrsMin: 2, hrsMax: 3, hrsDefault: 2.5 },
    { maxSqft: 3000,      cleaners: 2, hrsMin: 3, hrsMax: 5, hrsDefault: 4   },
    { maxSqft: 6000,      cleaners: 2, hrsMin: 4, hrsMax: 6, hrsDefault: 5   },
    { maxSqft: Infinity,  cleaners: 3, hrsMin: 6, hrsMax: 8, hrsDefault: 7   },
  ],

  // Recommended add-ons by property type (must match addon IDs below)
  propRecommendations: {
    office:      ['fridge',      'washroom',   'internal-glass'],
    gym:         ['disinfection','washroom',   'carpet'],
    salon:       ['washroom',    'floor-polish'],
    restaurant:  ['kitchen-deep','grease',     'washroom'],
    medical:     ['disinfection','fogging',    'washroom'],
    retail:      ['internal-glass','floor-polish'],
    warehouse:   ['floor-polish'],
  },

  // Add-on catalogue — each entry rendered as a toggleable row
  addons: [
    // ── Per-visit flat fee ──
    { id: 'fridge',         emoji: '🧊', name: 'Fridge Clean',               desc: 'Internal clean of client fridge(s)',         type: 'flat',   defaultVal: 20,  editable: true,  min: 15,  max: 50  },
    { id: 'microwave',      emoji: '📡', name: 'Microwave Clean',             desc: 'Internal microwave clean',                   type: 'flat',   defaultVal: 15,  editable: true,  min: 10,  max: 25  },
    { id: 'kitchen-deep',   emoji: '🍳', name: 'Kitchen Deep Clean',          desc: 'Full kitchen — surfaces, appliances, grease', type: 'flat',   defaultVal: 45,  editable: true,  min: 30,  max: 80  },
    { id: 'grease',         emoji: '🔥', name: 'Grease / Extract Removal',    desc: 'Commercial kitchen grease removal',           type: 'flat',   defaultVal: 60,  editable: true,  min: 40,  max: 120 },
    { id: 'washroom',       emoji: '🚽', name: 'Washroom Deep Sanitisation',  desc: 'Full deep sanitisation of facilities',        type: 'flat',   defaultVal: 30,  editable: true,  min: 20,  max: 60  },
    { id: 'consumables',    emoji: '🧴', name: 'Consumables Restocking',      desc: 'Soap, paper towels, hand sanitiser etc.',     type: 'flat',   defaultVal: 18,  editable: true,  min: 10,  max: 40  },
    // ── Premium services ──
    { id: 'carpet',         emoji: '🪄', name: 'Carpet Cleaning',             desc: 'Steam or dry carpet clean',                   type: 'flat',   defaultVal: 70,  editable: true,  min: 40,  max: 150 },
    { id: 'floor-polish',   emoji: '✨', name: 'Floor Polishing / Scrubbing', desc: 'Machine polish / scrub hard floors',          type: 'flat',   defaultVal: 80,  editable: true,  min: 50,  max: 200 },
    { id: 'internal-glass', emoji: '🪟', name: 'Internal Glass Cleaning',     desc: 'All internal glazing / partitions',           type: 'flat',   defaultVal: 35,  editable: true,  min: 20,  max: 70  },
    { id: 'windows',        emoji: '🏗️', name: 'Window Cleaning (External)',  desc: 'External window cleaning',                   type: 'flat',   defaultVal: 50,  editable: true,  min: 30,  max: 100 },
    { id: 'disinfection',   emoji: '🦠', name: 'Disinfection Service',        desc: 'Full surface disinfection treatment',         type: 'flat',   defaultVal: 35,  editable: true,  min: 20,  max: 70  },
    { id: 'fogging',        emoji: '💨', name: 'Anti-bacterial Fogging',      desc: 'Full-room fogger / misting service',          type: 'flat',   defaultVal: 80,  editable: true,  min: 40,  max: 150 },
    // ── Pain-based ──
    { id: 'recovery',       emoji: '🔄', name: 'Recovery Clean',              desc: 'Post-event / deep neglect uplift',            type: 'hourly', defaultVal: 10,  editable: true,  min: 5,   max: 20  },
    { id: 'end-tenancy',    emoji: '📦', name: 'End of Tenancy Clean',        desc: 'Full vacate clean + checklist',               type: 'flat',   defaultVal: 120, editable: true,  min: 80,  max: 300 },
    { id: 'pre-inspection', emoji: '🔍', name: 'Pre-Inspection Clean',        desc: 'Landlord / council inspection prep',          type: 'flat',   defaultVal: 60,  editable: true,  min: 40,  max: 120 },
  ],
};

/* ─────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────── */

const state = {
  // company
  companyName: '', contactName: '', location: '',
  // property
  propertyType: 'office', baseRate: 30, sqft: 1500,
  // job
  cleaners: 2, hours: 4,
  freq: 'one-off', freqDiscount: 0, visitsPw: 0,
  // type & premiums (hourly)
  cleanAdd: 0, cleanLabel: 'Standard',
  oohAdd: 0, equipAdd: 0,
  // condition / urgency (multipliers)
  condMult: 1.00, condLabel: 'Standard',
  urgMult:  1.00,
  // flat-fee per visit
  suppliesAdd: 0,
  // add-ons: { [id]: { enabled, value, type, name, emoji } }
  addonState: {},
  // custom add-ons: [ { name, value } ]
  customAddons: [],
  // owner settings
  cleanerRate:   15,
  overheadPct:   10,
  marginTarget:  30,
  commOneOff:    15,
  commM1:        15,
  commM2:        15,
  commM3:        10,
};

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */

const fmt     = n => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt  = n => '£' + Math.round(n).toLocaleString('en-GB');
const fmtPct  = n => n.toFixed(1) + '%';
const el      = id => document.getElementById(id);
const setText = (id, v) => { const e = el(id); if (e) e.textContent = v; };
const showEl  = (id, v) => { const e = el(id); if (e) e.style.display = v ? '' : 'none'; };

/* ─────────────────────────────────────────────────
   BUILD ADD-ONS UI
───────────────────────────────────────────────── */

function buildAddonsGrid() {
  const grid = el('addonsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  CONFIG.addons.forEach(addon => {
    // Init state
    if (!state.addonState[addon.id]) {
      state.addonState[addon.id] = { enabled: false, value: addon.defaultVal, type: addon.type, name: addon.name, emoji: addon.emoji };
    }

    const row = document.createElement('div');
    row.className = 'addon-row';
    row.dataset.id = addon.id;

    const priceLabel = addon.type === 'hourly'
      ? `+£${addon.defaultVal}/hr`
      : `£${addon.defaultVal}`;

    row.innerHTML = `
      <div class="addon-check"></div>
      <div class="addon-emoji">${addon.emoji}</div>
      <div class="addon-info">
        <div class="addon-name">${addon.name}</div>
        <div class="addon-desc">${addon.desc}</div>
      </div>
      <div class="addon-price-tag">${priceLabel}</div>
      ${addon.editable ? `<input class="addon-value-input" type="number" value="${addon.defaultVal}" min="${addon.min}" max="${addon.max}" step="5" title="Edit value">` : ''}
    `;

    // Toggle on click of row (but not on the value input)
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('addon-value-input')) return;
      toggleAddon(addon.id);
    });

    // Value change
    const input = row.querySelector('.addon-value-input');
    if (input) {
      input.addEventListener('change', () => {
        state.addonState[addon.id].value = parseFloat(input.value) || addon.defaultVal;
        calculate();
      });
      input.addEventListener('click', e => e.stopPropagation());
    }

    grid.appendChild(row);
  });
}

function toggleAddon(id) {
  const s = state.addonState[id];
  if (!s) return;
  s.enabled = !s.enabled;
  const row = document.querySelector(`.addon-row[data-id="${id}"]`);
  if (row) {
    row.classList.toggle('selected', s.enabled);
    const inp = row.querySelector('.addon-value-input');
    if (inp) {
      s.value = parseFloat(inp.value) || s.value;
    }
  }
  calculate();
}

function enableAddon(id) {
  if (!state.addonState[id]) return;
  state.addonState[id].enabled = true;
  const row = document.querySelector(`.addon-row[data-id="${id}"]`);
  if (row) row.classList.add('selected');
  calculate();
}

/* ─────────────────────────────────────────────────
   SMART RECOMMENDATION ENGINE
───────────────────────────────────────────────── */

function updateRecommendation() {
  const sqft = parseFloat(el('sqft')?.value) || 0;
  const rec  = CONFIG.sqftRecs.find(r => sqft <= r.maxSqft) || CONFIG.sqftRecs[CONFIG.sqftRecs.length - 1];
  const word = rec.cleaners === 1 ? '1 cleaner' : `${rec.cleaners}+ cleaners`;
  setText('recText', `Recommended: ${word} for ${rec.hrsMin}–${rec.hrsMax} hours`);
  el('recommendationBar').dataset.cleaners = rec.cleaners;
  el('recommendationBar').dataset.hrs      = rec.hrsDefault;
}

function applyRecommendation() {
  const bar = el('recommendationBar');
  el('cleaners').value = bar.dataset.cleaners || 1;
  el('hours').value    = bar.dataset.hrs      || 3;
  calculate();
}

function updatePropRecommendations() {
  const type  = state.propertyType;
  const recs  = CONFIG.propRecommendations[type] || [];
  const bar   = el('recAddonsBar');
  const list  = el('recAddonsList');
  const title = el('recAddonsTitle');

  if (!bar || !list) return;

  if (recs.length === 0) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  const propName = el(`[data-type="${type}"]`)?.querySelector('.prop-name')?.textContent || type;
  if (title) title.textContent = `Recommended for ${propName}`;

  list.innerHTML = '';
  recs.forEach(id => {
    const addon = CONFIG.addons.find(a => a.id === id);
    if (!addon) return;
    const chip = document.createElement('div');
    chip.className = 'rec-addon-chip';
    chip.textContent = addon.emoji + ' ' + addon.name;
    if (state.addonState[id]?.enabled) chip.classList.add('applied');
    chip.addEventListener('click', () => {
      enableAddon(id);
      chip.classList.add('applied');
    });
    list.appendChild(chip);
  });
}

/* ─────────────────────────────────────────────────
   CUSTOM ADD-ONS
───────────────────────────────────────────────── */

function applyCustomAddon() {
  const nameInp = el('customAddonName');
  const valInp  = el('customAddonValue');
  const name    = nameInp?.value.trim();
  const value   = parseFloat(valInp?.value) || 0;
  if (!name || value <= 0) return;

  state.customAddons.push({ name, value });
  if (nameInp) nameInp.value = '';
  if (valInp)  valInp.value  = '';
  renderCustomAddons();
  calculate();
}

function removeCustomAddon(idx) {
  state.customAddons.splice(idx, 1);
  renderCustomAddons();
  calculate();
}

function renderCustomAddons() {
  const list = el('customAddonsList');
  if (!list) return;
  list.innerHTML = '';
  state.customAddons.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = 'custom-addon-item';
    item.innerHTML = `<div>${a.emoji || '➕'} ${a.name}</div><span>${fmtInt(a.value)}</span><button class="custom-addon-remove" onclick="removeCustomAddon(${i})">✕</button>`;
    list.appendChild(item);
  });
}

/* ─────────────────────────────────────────────────
   MAIN CALCULATE
───────────────────────────────────────────────── */

function calculate() {
  // Pull text inputs
  state.companyName  = el('companyName')?.value.trim()  || '';
  state.contactName  = el('contactName')?.value.trim()  || '';
  state.location     = el('location')?.value.trim()     || '';
  state.sqft         = parseFloat(el('sqft')?.value)    || 0;
  state.cleaners     = parseFloat(el('cleaners')?.value)|| 1;
  state.hours        = parseFloat(el('hours')?.value)   || 1;

  // Owner settings
  state.cleanerRate   = parseFloat(el('cleanerRate')?.value)   || 15;
  state.overheadPct   = parseFloat(el('overheadPct')?.value)   || 10;
  state.marginTarget  = parseFloat(el('marginTarget')?.value)  || 30;
  state.commOneOff    = parseFloat(el('commOneOff')?.value)    || 15;
  state.commM1        = parseFloat(el('commM1')?.value)        || 15;
  state.commM2        = parseFloat(el('commM2')?.value)        || 15;
  state.commM3        = parseFloat(el('commM3')?.value)        || 10;

  const manHours = state.cleaners * state.hours;
  setText('manhoursDisplay', manHours + ' man-hrs');

  // ── Rate build-up (hourly) ──
  const baseRate       = state.baseRate;
  const cleanAdd       = state.cleanAdd;
  const oohAdd         = state.oohAdd;
  const equipAdd       = state.equipAdd;

  // Hourly add-on from recovery clean
  let hourlyAddonTotal = 0;
  CONFIG.addons.forEach(a => {
    const s = state.addonState[a.id];
    if (s?.enabled && a.type === 'hourly') hourlyAddonTotal += s.value;
  });

  const ratePreMult    = baseRate + cleanAdd + oohAdd + equipAdd + hourlyAddonTotal;
  const rateAfterCond  = ratePreMult * state.condMult;
  const rateAfterUrg   = rateAfterCond * state.urgMult;

  const condUplift     = rateAfterCond - ratePreMult;
  const urgUplift      = rateAfterUrg  - rateAfterCond;

  const discountAmt    = rateAfterUrg * (state.freqDiscount / 100);
  const rateAfterDisc  = rateAfterUrg - discountAmt;
  const bufferAmt      = rateAfterDisc * (CONFIG.buffer / 100);
  const finalHourly    = rateAfterDisc + bufferAmt;

  // ── Per-visit cost build ──
  const hourlyRevenue  = finalHourly * manHours;

  // Flat per-visit add-ons (catalogue)
  let flatAddonTotal = 0;
  const flatAddonLines = [];
  CONFIG.addons.forEach(a => {
    const s = state.addonState[a.id];
    if (s?.enabled && a.type === 'flat') {
      flatAddonTotal += s.value;
      flatAddonLines.push({ name: s.emoji + ' ' + s.name, value: s.value });
    }
  });

  // Custom add-ons
  let customTotal = 0;
  state.customAddons.forEach(a => {
    customTotal += a.value;
    flatAddonLines.push({ name: '➕ ' + a.name, value: a.value });
  });

  const suppliesCost   = state.suppliesAdd;
  const allFlatExtra   = flatAddonTotal + customTotal + suppliesCost;
  const revenueRaw     = hourlyRevenue + allFlatExtra;
  const minApplied     = revenueRaw < CONFIG.minJobValue;
  const revenue        = Math.max(revenueRaw, CONFIG.minJobValue);

  // ── Costs ──
  const labourCost     = state.cleanerRate * manHours;
  const totalDirectCost = labourCost + suppliesCost + flatAddonTotal + customTotal;
  const grossProfit    = revenue - totalDirectCost;
  const grossMargin    = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  // ── Price hero ──
  setText('pricePerVisit', fmtInt(revenue));
  setText('priceHourly',   fmt(finalHourly) + '/hr');
  showEl('minJobBadge', minApplied);

  const isOneOff     = state.freq === 'one-off';
  const visitsPw     = state.visitsPw;
  const visitsPerMo  = isOneOff ? 1 : visitsPw * 4.33;
  const visitsPerYr  = isOneOff ? 1 : visitsPw * 52;

  if (isOneOff) {
    setText('pricePerMonth', '—');
    setText('priceMonthSub', 'One-off booking');
  } else {
    setText('pricePerMonth', fmtInt(revenue * visitsPerMo));
    const vpLabel = visitsPw === 5 ? '~21 visits' : visitsPw === 2 ? '~9 visits' : '~4 visits';
    setText('priceMonthSub', vpLabel + '/month');
  }

  // ── Rate breakdown ──
  setText('bk-base', fmt(baseRate) + '/hr');
  showEl('bkrow-clean', cleanAdd > 0);
  if (cleanAdd > 0) {
    setText('bk-clean-label', state.cleanLabel + ' premium');
    setText('bk-clean', '+' + fmt(cleanAdd) + '/hr');
  }
  showEl('bkrow-ooh',   oohAdd  > 0);
  showEl('bkrow-equip', equipAdd > 0);
  showEl('bkrow-cond', condUplift > 0.001);
  if (condUplift > 0.001) {
    setText('bk-cond-label', state.condLabel + ' uplift');
    setText('bk-cond', '+' + fmt(condUplift) + '/hr');
  }
  showEl('bkrow-urg', urgUplift > 0.001);
  if (urgUplift > 0.001) setText('bk-urg', '+' + fmt(urgUplift) + '/hr');
  setText('bk-adjusted', fmt(rateAfterUrg) + '/hr');
  showEl('bkrow-disc', state.freqDiscount > 0);
  if (state.freqDiscount > 0) {
    setText('bk-disc-label', 'Frequency discount (−' + state.freqDiscount + '%)');
    setText('bk-disc', '−' + fmt(discountAmt) + '/hr');
  }
  setText('bk-buffer', '+' + fmt(bufferAmt) + '/hr');
  setText('bk-final',  fmt(finalHourly) + '/hr');

  // Flat fee lines in breakdown
  const flatsHeader = el('bkrow-flats-header');
  const flatsList   = el('bkrow-flats-list');
  const visitTotal  = el('bkrow-visit-total');
  if (flatAddonLines.length > 0 || suppliesCost > 0) {
    if (flatsHeader) flatsHeader.style.display = '';
    if (visitTotal)  visitTotal.style.display  = '';
    if (flatsList) {
      flatsList.innerHTML = '';
      if (suppliesCost > 0) {
        flatsList.innerHTML += `<div class="bk-row"><span>🧴 Supplies (per visit)</span><span class="bk-val bk-add">+${fmt(suppliesCost)}</span></div>`;
      }
      flatAddonLines.forEach(l => {
        flatsList.innerHTML += `<div class="bk-row"><span>${l.name}</span><span class="bk-val bk-add">+${fmt(l.value)}</span></div>`;
      });
    }
    setText('bk-visit-total', fmtInt(revenue));
  } else {
    if (flatsHeader) flatsHeader.style.display = 'none';
    if (flatsList)   flatsList.innerHTML = '';
    if (visitTotal)  visitTotal.style.display = 'none';
  }

  // ── Margin panel ──
  setText('mg-revenue', fmt(revenue));
  setText('mg-labour',  '−' + fmt(labourCost));
  setText('mg-labour-note', `(${manHours} hrs × £${state.cleanerRate})`);
  showEl('mgrow-supplies', suppliesCost > 0);
  if (suppliesCost > 0) setText('mg-supplies', '−' + fmt(suppliesCost));
  const hasAddonCost = (flatAddonTotal + customTotal) > 0;
  showEl('mgrow-addons', hasAddonCost);
  if (hasAddonCost) setText('mg-addons', '−' + fmt(flatAddonTotal + customTotal));

  const grossEl = el('mg-gross');
  if (grossEl) { grossEl.textContent = fmt(grossProfit); grossEl.style.color = grossProfit >= 0 ? '' : 'var(--red)'; }
  const pctEl = el('mg-pct');
  if (pctEl) {
    pctEl.textContent = fmtPct(grossMargin);
    pctEl.style.color = grossMargin >= state.marginTarget ? 'var(--green)'
      : grossMargin >= state.marginTarget * 0.75          ? 'var(--amber)' : 'var(--red)';
  }

  // Margin bar
  const barFill = el('mvBarFill');
  if (barFill) barFill.style.width = Math.min(grossMargin / 60 * 100, 100) + '%';
  const marker = el('mvTarget');
  if (marker) {
    marker.style.left = Math.min(state.marginTarget / 60 * 100, 100) + '%';
    marker.setAttribute('data-label', 'Target ' + state.marginTarget + '%');
  }
  setText('mvTargetLabel', 'Target: ' + state.marginTarget + '%');

  const badge = el('marginStatusBadge');
  if (badge) {
    badge.className = 'margin-status-badge';
    if (grossMargin >= state.marginTarget) {
      badge.classList.add('badge-good');
      badge.textContent = '✅ Healthy margin — ' + fmtPct(grossMargin) + ' gross';
    } else if (grossMargin >= state.marginTarget * 0.75) {
      badge.classList.add('badge-warn');
      badge.textContent = '⚠️ Below target margin — consider adjusting the rate (' + fmtPct(grossMargin) + ' vs ' + state.marginTarget + '% target)';
    } else {
      badge.classList.add('badge-bad');
      badge.textContent = '🚫 Warning: very low margin — this job needs repricing (' + fmtPct(grossMargin) + ')';
    }
  }

  // ── Projections ──
  showEl('projOneOffNote', isOneOff);
  const periods = [
    { key: 'w', visits: isOneOff ? 1         : visitsPw,        label: 'pw' },
    { key: 'm', visits: isOneOff ? 1         : visitsPw * 4.33, label: 'pm' },
    { key: 'q', visits: isOneOff ? 1         : visitsPw * 13,   label: 'pq' },
    { key: 'y', visits: isOneOff ? 1         : visitsPw * 52,   label: 'py' },
  ];
  periods.forEach(({ key, visits }) => {
    if (isOneOff && key !== 'w') {
      setText(`pt-${key}-v`, '—'); setText(`pt-${key}-r`, '—');
      setText(`pt-${key}-l`, '—'); setText(`pt-${key}-p`, '—'); setText(`pt-${key}-m`, '—');
      return;
    }
    const rev    = revenue     * visits;
    const labour = labourCost  * visits;
    const profit = grossProfit * visits;
    setText(`pt-${key}-v`, isOneOff ? '1' : (Number.isInteger(visits) ? visits : visits.toFixed(1)));
    setText(`pt-${key}-r`, fmtInt(rev));
    setText(`pt-${key}-l`, fmtInt(labour));
    setText(`pt-${key}-p`, fmtInt(profit));
    setText(`pt-${key}-m`, fmtPct(grossMargin));
  });

  // ── Net Profit (Annual) ──
  const annualRev      = revenue     * visitsPerYr;
  const annualLabour   = labourCost  * visitsPerYr;
  const annualSupplies = suppliesCost * visitsPerYr;
  const annualAddons   = (flatAddonTotal + customTotal) * visitsPerYr;
  const annualOverhead = annualRev * (state.overheadPct / 100);
  const monthRev       = revenue * visitsPerMo;

  let annualCommission = 0;
  if (isOneOff) {
    annualCommission = revenue * (state.commOneOff / 100);
  } else {
    annualCommission =
      monthRev * (state.commM1 / 100) +
      monthRev * (state.commM2 / 100) +
      monthRev * (state.commM3 / 100);
  }

  const annualNetProfit = annualRev - annualLabour - annualSupplies - annualAddons - annualOverhead - annualCommission;
  const annualNetMargin = annualRev > 0 ? (annualNetProfit / annualRev) * 100 : 0;

  setText('net-oh-label',   state.overheadPct);
  setText('net-rev',        fmtInt(annualRev));
  setText('net-labour',     '−' + fmtInt(annualLabour));
  showEl('netrow-supplies', annualSupplies > 0);
  if (annualSupplies > 0) setText('net-supplies', '−' + fmtInt(annualSupplies));
  showEl('netrow-addons',   annualAddons > 0);
  if (annualAddons > 0)   setText('net-addons', '−' + fmtInt(annualAddons));
  setText('net-overhead',   '−' + fmtInt(annualOverhead));
  setText('net-commission', '−' + fmtInt(annualCommission));
  const netProfEl = el('net-profit');
  if (netProfEl) { netProfEl.textContent = fmtInt(annualNetProfit); netProfEl.style.color = annualNetProfit >= 0 ? '' : 'var(--red)'; }
  setText('net-margin', fmtPct(annualNetMargin));

  // ── Agent Commission Card ──
  if (isOneOff) {
    showEl('commOneOffRow',     true);
    showEl('commContractRows',  false);
    setText('commOneOffAmt', fmtInt(revenue * (state.commOneOff / 100)));
  } else {
    showEl('commOneOffRow',    false);
    showEl('commContractRows', true);
    setText('commM1Amt',    fmtInt(monthRev * (state.commM1 / 100)));
    setText('commM2Amt',    fmtInt(monthRev * (state.commM2 / 100)));
    setText('commM3Amt',    fmtInt(monthRev * (state.commM3 / 100)));
    setText('commTotalAmt', fmtInt(monthRev * (state.commM1 + state.commM2 + state.commM3) / 100));
  }

  // ── Client Quote ──
  generateQuote({ revenue, monthRev, finalHourly, isOneOff, flatAddonLines, suppliesCost });
}

/* ─────────────────────────────────────────────────
   QUOTE GENERATOR
───────────────────────────────────────────────── */

function generateQuote({ revenue, monthRev, finalHourly, isOneOff, flatAddonLines, suppliesCost }) {
  const company  = state.companyName || '[Company Name]';
  const contact  = state.contactName;
  const loc      = state.location ? ' based in ' + state.location : '';

  const propLabels = {
    office: 'office', gym: 'gym', salon: 'salon / barber shop',
    restaurant: 'restaurant', medical: 'medical facility',
    retail: 'retail unit', warehouse: 'warehouse',
  };
  const freqLabels = {
    'one-off': 'One-off visit', weekly: 'Weekly', '2xweekly': '2× per week', daily: 'Daily (5× per week)',
  };

  const propLabel = propLabels[state.propertyType] || 'property';
  const freqLabel = freqLabels[state.freq] || state.freq;

  const greeting = contact ? `Hi ${contact},` : `Hi ${company},`;

  // Build services included list
  const serviceLines = ['Professional, fully vetted cleaning staff'];
  if (state.cleanAdd > 0) serviceLines.push(state.cleanLabel);
  if (state.oohAdd  > 0) serviceLines.push('Out-of-hours scheduling');
  if (state.equipAdd > 0) serviceLines.push('All equipment provided by SweepRight');
  if (suppliesCost  > 0) serviceLines.push('Cleaning consumables and supplies');
  if (state.condMult > 1) serviceLines.push('Specialist uplift for ' + state.condLabel.toLowerCase() + ' conditions');
  flatAddonLines.forEach(a => serviceLines.push(a.name.replace(/^[^\s]+\s/, '')));  // strip emoji
  serviceLines.push('Flexible scheduling to suit your business');
  serviceLines.push('Dedicated account manager and full public liability insurance');

  // Referral
  const referralLine = `\n💸 Referral Offer: Refer another business and you'll both receive £40 off your next clean.`;

  // Monthly line
  const monthlyLine = isOneOff
    ? ''
    : `Monthly estimate: ${fmtInt(monthRev)} (based on ${Math.round(state.visitsPw * 4.33)} visits/month)\n`;

  const quote =
`${greeting}

Thank you for your interest in SweepRight${loc}.

Based on your requirements for your ${propLabel}, we're pleased to offer:

Service: ${propLabel.charAt(0).toUpperCase() + propLabel.slice(1)} cleaning
Frequency: ${freqLabel}
Price per visit: ${fmtInt(revenue)}
${monthlyLine}
What's included:
${serviceLines.map(s => '• ' + s).join('\n')}
${referralLine}

We take pride in reliability, quality, and complete transparency — no hidden fees, ever.

We can get started this week. Please reply to let us know if you'd like to proceed or if you have any questions.

Best regards,
SweepRight Commercial Team
📞 ${CONFIG.contactPhone}
📧 ${CONFIG.contactEmail}`;

  const quoteEl = el('quoteOutput');
  if (quoteEl) quoteEl.textContent = quote;
}

/* ─────────────────────────────────────────────────
   UI SELECTION HANDLERS
───────────────────────────────────────────────── */

function selectProp(elmt) {
  document.querySelectorAll('.prop-option').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  state.propertyType = elmt.dataset.type;
  state.baseRate     = parseFloat(elmt.dataset.rate) || 30;
  updatePropRecommendations();
  calculate();
}

function selectFreq(elmt) {
  document.querySelectorAll('.freq-opt').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  state.freq         = elmt.dataset.freq;
  state.freqDiscount = parseFloat(elmt.dataset.discount) || 0;
  state.visitsPw     = parseFloat(elmt.dataset.vpw)      || 0;
  calculate();
}

function selectClean(elmt) {
  document.querySelectorAll('.clean-opt').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  state.cleanAdd   = parseFloat(elmt.dataset.add) || 0;
  state.cleanLabel = elmt.querySelector('.clean-name')?.textContent || 'Standard';
  calculate();
}

function selectPair(elmt, key) {
  elmt.parentElement.querySelectorAll('.pair-opt').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  const val = parseFloat(elmt.dataset.val) || 0;
  if (key === 'equip')    state.equipAdd   = val;
  if (key === 'ooh')      state.oohAdd     = val;
  if (key === 'supplies') {
    state.suppliesAdd = val;
    const customRow = el('suppliesCustomRow');
    if (customRow) customRow.style.display = val > 0 ? '' : 'none';
    if (val > 0) {
      const inp = el('suppliesCostInput');
      if (inp) state.suppliesAdd = parseFloat(inp.value) || 20;
    }
  }
  calculate();
}

function selectCond(elmt) {
  document.querySelectorAll('.cond-opt').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  state.condMult  = parseFloat(elmt.dataset.mult) || 1;
  state.condLabel = elmt.querySelector('.cond-name')?.textContent || 'Standard';
  calculate();
}

function selectUrg(elmt) {
  document.querySelectorAll('.urg-opt').forEach(o => o.classList.remove('selected'));
  elmt.classList.add('selected');
  state.urgMult = parseFloat(elmt.dataset.mult) || 1;
  calculate();
}

function stepField(fieldId, delta) {
  const input = el(fieldId);
  if (!input) return;
  const step    = parseFloat(input.step) || 1;
  const current = parseFloat(input.value) || 0;
  const min     = parseFloat(input.min)   || 0;
  const max     = parseFloat(input.max)   || Infinity;
  input.value   = Math.min(max, Math.max(min, +(current + delta).toFixed(2)));
  calculate();
}

/* ─────────────────────────────────────────────────
   VIEW TOGGLE
───────────────────────────────────────────────── */

function setView(view) {
  document.body.classList.toggle('owner-view', view === 'owner');
  el('btnSales')?.classList.toggle('active', view === 'sales');
  el('btnOwner')?.classList.toggle('active', view === 'owner');
}

/* ─────────────────────────────────────────────────
   COPY QUOTE
───────────────────────────────────────────────── */

function copyQuote() {
  const text = el('quoteOutput')?.textContent || '';
  const btn  = el('copyBtn');
  navigator.clipboard.writeText(text)
    .then(() => flashCopied(btn))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); flashCopied(btn);
    });
}

function flashCopied(btn) {
  if (!btn) return;
  btn.classList.add('copied');
  btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg> Copied!`;
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg> Copy`;
  }, 2500);
}

/* ─────────────────────────────────────────────────
   RESET
───────────────────────────────────────────────── */

function resetAll() {
  ['companyName','contactName','location'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  el('sqft').value     = '1500';
  el('cleaners').value = '2';
  el('hours').value    = '4';

  document.querySelectorAll('.prop-option').forEach(o => o.classList.remove('selected'));
  document.querySelector('[data-type="office"]')?.classList.add('selected');
  state.propertyType = 'office'; state.baseRate = 30;

  document.querySelectorAll('.freq-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('[data-freq="one-off"]')?.classList.add('selected');
  state.freq = 'one-off'; state.freqDiscount = 0; state.visitsPw = 0;

  document.querySelectorAll('.clean-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('.clean-opt:first-child')?.classList.add('selected');
  state.cleanAdd = 0; state.cleanLabel = 'Standard';

  document.querySelectorAll('.pair-opt').forEach(o => {
    o.classList.toggle('selected', o === o.parentElement.querySelector('.pair-opt:first-child'));
  });
  state.equipAdd = 0; state.suppliesAdd = 0; state.oohAdd = 0;
  showEl('suppliesCustomRow', false);

  document.querySelectorAll('.cond-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('.cond-opt:first-child')?.classList.add('selected');
  state.condMult = 1; state.condLabel = 'Standard';

  document.querySelectorAll('.urg-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('.urg-opt:first-child')?.classList.add('selected');
  state.urgMult = 1;

  // Reset add-ons
  CONFIG.addons.forEach(a => { state.addonState[a.id] = { enabled: false, value: a.defaultVal, type: a.type, name: a.name, emoji: a.emoji }; });
  document.querySelectorAll('.addon-row').forEach(r => r.classList.remove('selected'));
  state.customAddons = [];
  renderCustomAddons();

  // Reset owner fields
  el('cleanerRate').value  = '15';
  el('overheadPct').value  = '10';
  el('marginTarget').value = '30';
  el('commOneOff').value   = '15';
  el('commM1').value       = '15';
  el('commM2').value       = '15';
  el('commM3').value       = '10';

  updateRecommendation();
  updatePropRecommendations();
  calculate();
}

/* ─────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  buildAddonsGrid();
  updateRecommendation();
  updatePropRecommendations();
  calculate();

  // Wire supplies custom input live
  const suppInp = el('suppliesCostInput');
  if (suppInp) suppInp.addEventListener('input', () => {
    state.suppliesAdd = parseFloat(suppInp.value) || 0;
    calculate();
  });
});
