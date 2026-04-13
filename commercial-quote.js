/**
 * SweepRight — Commercial Quote Calculator
 * Internal tool — backend team use only
 */

'use strict';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */

const PROPERTY_RATES = {
  office:    { label: 'Office (Standard)',       baseRate: 24 },
  coworking: { label: 'Co-working Space',        baseRate: 25 },
  serviced:  { label: 'Serviced Apartment',      baseRate: 26 },
  retail:    { label: 'Retail Unit',             baseRate: 24 },
  warehouse: { label: 'Warehouse / Industrial',  baseRate: 22 },
  medical:   { label: 'Medical / Healthcare',    baseRate: 32 },
};

const OOH_PREMIUM   = 4;   // £/hr — out of hours
const DEEP_PREMIUM  = 8;   // £/hr — deep / specialist clean
const EQUIP_PREMIUM = 3;   // £/hr — specialist equipment

// Visits per week for each frequency option
const FREQ_VISITS_PW = {
  'one-off':  0,
  'monthly':  0.25,
  'biweekly': 0.5,
  'weekly':   1,
  'thrice':   3,
  'daily':    5,
};

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */

let state = {
  propertyType: 'office',
  sqft:         2000,
  cleaners:     2,
  hours:        4,
  freq:         'one-off',
  freqDiscount: 0,
  visitsPw:     0,
  ooh:          false,
  deep:         false,
  equip:        false,
  supplies:     false,
  suppliesCost: 20,
  overheadPct:  10,
  commissionPct:10,
  cleanerRate:  15,
  marginTarget: 25,
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function fmt(val) {
  return '£' + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(val) {
  return '£' + Math.round(val).toLocaleString('en-GB');
}

function pct(val) {
  return val.toFixed(1) + '%';
}

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showRow(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? 'flex' : 'none';
}

/* ─────────────────────────────────────────
   CORE CALCULATE
───────────────────────────────────────── */

function calculate() {
  // Read all inputs into state
  state.propertyType  = document.getElementById('propertyType').value;
  state.sqft          = parseFloat(document.getElementById('sqft').value)         || 0;
  state.cleaners      = parseFloat(document.getElementById('cleaners').value)      || 1;
  state.hours         = parseFloat(document.getElementById('hours').value)         || 1;
  state.suppliesCost  = parseFloat(document.getElementById('suppliesCost').value)  || 0;
  state.overheadPct   = parseFloat(document.getElementById('overheadPct').value)   || 0;
  state.commissionPct = parseFloat(document.getElementById('commissionPct').value) || 0;
  state.cleanerRate   = parseFloat(document.getElementById('cleanerRate').value)   || 15;
  state.marginTarget  = parseFloat(document.getElementById('marginTarget').value)  || 25;

  // Man-hours
  const manHours = state.cleaners * state.hours;
  document.getElementById('manHours').value = manHours;

  // Base rate from property type
  const prop     = PROPERTY_RATES[state.propertyType];
  const baseRate = prop.baseRate;
  document.getElementById('typeHint').textContent = 'Base rate: £' + baseRate + '/hr';

  // Premiums
  const oohAdd   = state.ooh   ? OOH_PREMIUM   : 0;
  const deepAdd  = state.deep  ? DEEP_PREMIUM  : 0;
  const equipAdd = state.equip ? EQUIP_PREMIUM : 0;
  const adjustedRate = baseRate + oohAdd + deepAdd + equipAdd;

  // Frequency discount
  const discountAmt  = adjustedRate * (state.freqDiscount / 100);
  const finalRate    = adjustedRate - discountAmt;

  // Per-visit financials
  const revenuePerVisit      = finalRate    * manHours;
  const labourCostPerVisit   = state.cleanerRate * manHours;
  const suppliesCostPerVisit = state.supplies ? state.suppliesCost : 0;
  const totalCostPerVisit    = labourCostPerVisit + suppliesCostPerVisit;
  const grossProfitPerVisit  = revenuePerVisit - totalCostPerVisit;
  const grossMarginPct       = revenuePerVisit > 0 ? (grossProfitPerVisit / revenuePerVisit) * 100 : 0;

  /* ── Update Rate Breakdown ── */
  setEl('out-baseRate',     fmt(baseRate)     + '/hr');
  setEl('out-adjustedRate', fmt(adjustedRate) + '/hr');
  setEl('out-discountLabel', 'Frequency discount (' + state.freqDiscount + '%)');

  showRow('row-ooh',   state.ooh);
  showRow('row-deep',  state.deep);
  showRow('row-equip', state.equip);

  if (state.ooh)   setEl('out-oohPremium',   '+' + fmt(OOH_PREMIUM)   + '/hr');
  if (state.deep)  setEl('out-deepPremium',  '+' + fmt(DEEP_PREMIUM)  + '/hr');
  if (state.equip) setEl('out-equipPremium', '+' + fmt(EQUIP_PREMIUM) + '/hr');

  if (state.freqDiscount > 0) {
    setEl('out-discount', '−' + fmt(discountAmt) + '/hr');
  } else {
    setEl('out-discount', '—');
  }
  setEl('out-finalRate', fmt(finalRate) + '/hr');

  /* ── Update Per-Visit P&L ── */
  setEl('out-manHours2', manHours + ' hrs');
  setEl('out-revenue',     fmt(revenuePerVisit));
  setEl('out-cleanerCost', '− ' + fmt(labourCostPerVisit));
  setEl('out-cleanerCostNote',
    '(£' + state.cleanerRate + '/hr × ' + manHours + ' hrs)');

  const suppliesRow = document.getElementById('row-suppliesCost');
  if (suppliesRow) suppliesRow.style.display = state.supplies ? 'flex' : 'none';
  setEl('out-suppliesCost', '− ' + fmt(suppliesCostPerVisit));

  setEl('out-grossProfit', fmt(grossProfitPerVisit));

  const marginEl = document.getElementById('out-grossMargin');
  if (marginEl) {
    marginEl.textContent = pct(grossMarginPct);
    marginEl.style.color = grossMarginPct >= state.marginTarget
      ? 'var(--green)' : grossMarginPct >= state.marginTarget * 0.75
      ? 'var(--amber)' : 'var(--red)';
  }

  /* ── Margin Bar ── */
  const barFill   = document.getElementById('marginBarFill');
  const targetLine = document.getElementById('marginTargetLine');
  const capPct    = Math.min(grossMarginPct, 60);
  if (barFill)    barFill.style.width = (capPct / 60 * 100) + '%';
  if (targetLine) {
    const targetPos = Math.min(state.marginTarget, 60) / 60 * 100;
    targetLine.style.left = targetPos + '%';
    targetLine.setAttribute('data-label', 'Target ' + state.marginTarget + '%');
  }
  setEl('marginTargetLabel', 'Target: ' + state.marginTarget + '%');

  const statusEl = document.getElementById('marginStatus');
  if (statusEl) {
    statusEl.className = 'margin-status';
    if (grossMarginPct >= state.marginTarget) {
      statusEl.classList.add('status-good');
      statusEl.textContent = '✅ Margin is on target (' + pct(grossMarginPct) + ' ≥ ' + pct(state.marginTarget) + ')';
    } else if (grossMarginPct >= state.marginTarget * 0.75) {
      statusEl.classList.add('status-warn');
      statusEl.textContent = '⚠️ Margin is below target — review rate or reduce costs (' + pct(grossMarginPct) + ' vs ' + pct(state.marginTarget) + ' target)';
    } else {
      statusEl.classList.add('status-bad');
      statusEl.textContent = '🚫 Margin is too low — this job is underpriced at current cost (' + pct(grossMarginPct) + ')';
    }
  }

  /* ── Projections ── */
  const isOneOff   = state.freq === 'one-off';
  const oneOffNote = document.getElementById('oneOffNote');
  if (oneOffNote) oneOffNote.style.display = isOneOff ? 'flex' : 'none';

  const visitsPw = FREQ_VISITS_PW[state.freq] || 0;

  // Periods: visits, revenue, labour, gross profit
  const periods = {
    week:    visitsPw,
    month:   visitsPw * 4.33,
    quarter: visitsPw * 13,
    year:    visitsPw * 52,
  };

  Object.entries(periods).forEach(([key, visitsInPeriod]) => {
    if (isOneOff) {
      setEl('proj-' + key + '-visits', key === 'week' ? '1' : '—');
      setEl('proj-' + key + '-rev',    key === 'week' ? fmtInt(revenuePerVisit)    : '—');
      setEl('proj-' + key + '-cost',   key === 'week' ? fmtInt(labourCostPerVisit) : '—');
      setEl('proj-' + key + '-profit', key === 'week' ? fmtInt(grossProfitPerVisit): '—');
      setEl('proj-' + key + '-margin', key === 'week' ? pct(grossMarginPct)        : '—');
    } else {
      const rev    = revenuePerVisit    * visitsInPeriod;
      const labour = labourCostPerVisit * visitsInPeriod;
      const supps  = suppliesCostPerVisit * visitsInPeriod;
      const profit = grossProfitPerVisit  * visitsInPeriod;
      setEl('proj-' + key + '-visits', visitsInPeriod < 1
        ? (visitsInPeriod * 4.33).toFixed(1) + '/mo'
        : Number.isInteger(visitsInPeriod) ? visitsInPeriod : visitsInPeriod.toFixed(1));
      setEl('proj-' + key + '-rev',    fmtInt(rev));
      setEl('proj-' + key + '-cost',   fmtInt(labour + supps));
      setEl('proj-' + key + '-profit', fmtInt(profit));
      setEl('proj-' + key + '-margin', pct(grossMarginPct));
    }
  });

  /* ── Net Profit (Annual) ── */
  const annualVisits = isOneOff ? 1 : visitsPw * 52;
  const annualRev    = revenuePerVisit    * annualVisits;
  const annualLabour = labourCostPerVisit * annualVisits;
  const annualSupps  = suppliesCostPerVisit * annualVisits;
  const annualOverhead   = annualRev * (state.overheadPct / 100);
  // Commission: 10% of 3 months' retainer value (first 3 months only)
  const annualCommission = isOneOff
    ? revenuePerVisit * (state.commissionPct / 100)
    : (revenuePerVisit * visitsPw * 4.33 * 3) * (state.commissionPct / 100);
  const annualNetProfit  = annualRev - annualLabour - annualSupps - annualOverhead - annualCommission;
  const annualNetMargin  = annualRev > 0 ? (annualNetProfit / annualRev) * 100 : 0;

  setEl('net-oh-pct',    state.overheadPct);
  setEl('net-comm-pct',  state.commissionPct);
  setEl('net-rev',       fmtInt(annualRev));
  setEl('net-labour',    '−' + fmtInt(annualLabour + annualSupps));
  setEl('net-overhead',  '−' + fmtInt(annualOverhead));
  setEl('net-commission','−' + fmtInt(annualCommission));

  const netProfitEl = document.getElementById('net-profit');
  if (netProfitEl) {
    netProfitEl.textContent  = fmtInt(annualNetProfit);
    netProfitEl.style.color  = annualNetProfit >= 0 ? '' : 'var(--red)';
  }
  setEl('net-margin', pct(annualNetMargin));

  /* ── Client-Facing Quote Summary ── */
  const freqLabels = {
    'one-off':  'One-off',
    'monthly':  'Monthly',
    'biweekly': 'Bi-weekly',
    'weekly':   'Weekly',
    'thrice':   '3× per week',
    'daily':    'Daily (5× per week)',
  };

  const premiumsList = [];
  if (state.ooh)   premiumsList.push('Out-of-hours');
  if (state.deep)  premiumsList.push('Deep / specialist clean');
  if (state.equip) premiumsList.push('Specialist equipment');
  if (state.supplies) premiumsList.push('Consumables included');

  const quote = [
    'SWEEPRIGHT — COMMERCIAL CLEANING QUOTE',
    '─────────────────────────────────────',
    'Property Type  : ' + prop.label,
    'Property Size  : ' + state.sqft.toLocaleString('en-GB') + ' sq ft',
    'Team Size      : ' + state.cleaners + ' cleaner' + (state.cleaners > 1 ? 's' : ''),
    'Hours / Visit  : ' + state.hours + ' hrs  (' + manHours + ' man-hrs)',
    'Frequency      : ' + freqLabels[state.freq],
    premiumsList.length ? 'Extras         : ' + premiumsList.join(', ') : null,
    '',
    'RATE',
    '  Base rate      : ' + fmt(baseRate) + '/hr',
    adjustedRate !== baseRate ? '  After premiums : ' + fmt(adjustedRate) + '/hr' : null,
    state.freqDiscount > 0 ? '  Freq. discount : −' + state.freqDiscount + '%' : null,
    '  Client rate    : ' + fmt(finalRate) + '/hr',
    '',
    'PER VISIT',
    '  Client charge  : ' + fmt(revenuePerVisit),
    '',
    isOneOff ? null : 'ANNUAL',
    isOneOff ? null : '  Revenue        : ' + fmtInt(annualRev),
    isOneOff ? null : '  Net profit (est): ' + fmtInt(annualNetProfit),
    '',
    'Generated by SweepRight Quote Calculator — ' + new Date().toLocaleDateString('en-GB'),
  ].filter(line => line !== null).join('\n');

  const quoteBox = document.getElementById('quoteBox');
  if (quoteBox) quoteBox.textContent = quote;
}

/* ─────────────────────────────────────────
   UI INTERACTIONS
───────────────────────────────────────── */

function selectFreq(el) {
  document.querySelectorAll('.freq-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.freq         = el.dataset.freq;
  state.freqDiscount = parseFloat(el.dataset.discount) || 0;
  state.visitsPw     = parseFloat(el.dataset.visitsPw)  || 0;
  calculate();
}

function toggleSwitch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on');
  // Sync to state
  state.ooh     = document.getElementById('toggleOOH').classList.contains('on');
  state.deep    = document.getElementById('toggleDeep').classList.contains('on');
  state.equip   = document.getElementById('toggleEquip').classList.contains('on');
  state.supplies = document.getElementById('toggleSupplies').classList.contains('on');
}

function suppliesToggle() {
  const suppliesOn = document.getElementById('toggleSupplies').classList.contains('on');
  const inputEl    = document.getElementById('suppliesInput');
  if (inputEl) inputEl.classList.toggle('hidden', !suppliesOn);
  state.supplies = suppliesOn;
  calculate();
}

function copyQuote() {
  const text = document.getElementById('quoteBox').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function resetForm() {
  // Reset selects and inputs
  document.getElementById('propertyType').value  = 'office';
  document.getElementById('sqft').value          = '2000';
  document.getElementById('cleaners').value      = '2';
  document.getElementById('hours').value         = '4';
  document.getElementById('suppliesCost').value  = '20';
  document.getElementById('overheadPct').value   = '10';
  document.getElementById('commissionPct').value = '10';
  document.getElementById('cleanerRate').value   = '15';
  document.getElementById('marginTarget').value  = '25';

  // Reset frequency to one-off
  document.querySelectorAll('.freq-option').forEach(o => o.classList.remove('selected'));
  const firstFreq = document.querySelector('[data-freq="one-off"]');
  if (firstFreq) firstFreq.classList.add('selected');
  state.freq         = 'one-off';
  state.freqDiscount = 0;
  state.visitsPw     = 0;

  // Reset toggles
  ['toggleOOH', 'toggleDeep', 'toggleEquip', 'toggleSupplies'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('on');
  });
  state.ooh = state.deep = state.equip = state.supplies = false;
  document.getElementById('suppliesInput').classList.add('hidden');

  calculate();
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  calculate();
});
