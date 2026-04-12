/* ═══════════════════════════════════════════════════════
   SweepRight — Main Application JS
   Production-ready quote builder + booking + payment flow
   ═══════════════════════════════════════════════════════ */

// ── CENTRAL CONFIG ──
const CONFIG = {
  rates: { home: 26, commercial: 28 },
  displayRates: { home: 24, commercial: 26 },
  minHours: 3,
  minBookingLeadHours: 48,
  discounts: {
    'one-off':      0,
    'daily':       12.5,
    'weekly':      10,
    'fortnightly':  7,
    'monthly':      5,
  },
  contact: {
    phone: '+44 7425 583734',
    email: 'cleaners@sweeprightcleaning.com',
  },
  // Home: recommendation = baseMins + (bedrooms × perBedMins) + (bathrooms × perBathMins)
  homeTimeBase: 120,     // 2 hrs base
  homePerBed: 45,        // 45 mins per bedroom
  homePerBath: 30,       // 30 mins per bathroom
  // Commercial sqft → recommended hours
  commercialRecs: [
    { maxSqft: 1000,     recMin: 3,   recMax: 4,   recDefault: 3.5 },
    { maxSqft: 2000,     recMin: 3.5, recMax: 5,   recDefault: 4   },
    { maxSqft: 3000,     recMin: 4,   recMax: 6,   recDefault: 5   },
    { maxSqft: 5000,     recMin: 5,   recMax: 8,   recDefault: 6.5 },
    { maxSqft: Infinity, recMin: 6,   recMax: 10,  recDefault: 8   },
  ],
  homeExtras: [
    { id: 'oven',          emoji: '🍳', name: 'Inside Oven Clean',    mins: 40 },
    { id: 'fridge',        emoji: '🧊', name: 'Fridge Clean',         mins: 20 },
    { id: 'pet-hair',      emoji: '🐾', name: 'Pet Hair Removal',     mins: 25 },
    { id: 'balcony',       emoji: '🌅', name: 'Balcony Clean',        mins: 25 },
    { id: 'sofa',          emoji: '🛋️', name: 'Sofa Clean',           mins: 30 },
    { id: 'laundry',       emoji: '🧺', name: 'Laundry',              mins: 25 },
    { id: 'ironing',       emoji: '👔', name: 'Ironing',              mins: 25 },
    { id: 'windows',       emoji: '🪟', name: 'Interior Windows',     mins: 20 },
    { id: 'deep-bath',     emoji: '🚿', name: 'Deep Bathroom Clean',  mins: 20 },
    { id: 'kitchen-deep',  emoji: '🍽️', name: 'Kitchen Deep Clean',   mins: 30 },
  ],
  commercialExtras: [
    { id: 'washroom',         emoji: '🚽', name: 'Washroom Sanitisation',          mins: 20 },
    { id: 'internal-glass',   emoji: '🪟', name: 'Internal Glass Cleaning',        mins: 20 },
    { id: 'carpet-spot',      emoji: '🧹', name: 'Carpet Spot Clean',              mins: 30 },
    { id: 'carpet',           emoji: '🪄', name: 'Carpet Cleaning',                mins: 45 },
    { id: 'disinfection',     emoji: '🦠', name: 'Disinfection / Sanitisation',    mins: 30 },
    { id: 'kitchen-breakroom', emoji: '☕', name: 'Kitchen / Breakroom Deep Clean', mins: 30 },
  ],
  sharedExtras: [
    { id: 'deep-clean-addon',  emoji: '✨', name: 'Deep Clean Upgrade',             mins: 60 },
    { id: 'end-of-tenancy',    emoji: '📦', name: 'End of Tenancy Clean',           mins: 90 },
    { id: 'pre-inspection',    emoji: '🔍', name: 'Pre-inspection Clean',           mins: 45 },
  ],
};

// ── BOOKING STATE ──
const state = {
  step: 1,
  totalSteps: 7,
  // Step 1
  serviceCategory: 'home',  // 'home' | 'commercial'
  propertyType: '',
  // Step 2
  bedrooms: 2,
  bathrooms: 1,
  sqft: 1500,
  recMinHrs: 3,
  recMaxHrs: 4,
  recDefaultHrs: 3.5,
  // Step 3
  hours: 3,
  frequency: 'one-off',
  belowRecExplanation: '',
  // Step 4
  selectedExtras: {},   // { id: true }
  extraTimeMins: 0,
  // Step 5
  bookingDate: '',
  timeWindow: 'morning',
  recurringStartDate: '',
  recurringDays: [],
  // Step 6
  customerName: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  postcode: '',
  accessInstructions: '',
  // Calculated
  hourlyRate: 26,
  discountPct: 0,
  baseHoursTotal: 0,
  extraHoursTotal: 0,
  totalHours: 0,
  subtotal: 0,
  discountAmount: 0,
  finalTotal: 0,
};

// ── MOBILE NAV ──
function toggleMobile() {
  document.getElementById('mobileMenu').classList.toggle('open');
}
document.addEventListener('click', function(e) {
  const menu = document.getElementById('mobileMenu');
  const burger = document.querySelector('.burger');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !burger.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// ── FAQ ──
function toggleFaq(el) {
  const item = el.parentElement;
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}
function filterFaq(cat, btn) {
  document.querySelectorAll('.faq-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.faq-item').forEach(item => {
    item.style.display = (cat === 'all' || item.dataset.cat === cat) ? 'block' : 'none';
  });
}

// ── CONTACT FORM ──
function submitContact() {
  const msg = document.getElementById('contactSuccess');
  if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 5000); }
}

// ── PRICING PAGE TOGGLE ──
let pricingRecurring = false;
function togglePricing() {
  pricingRecurring = !pricingRecurring;
  const toggle = document.getElementById('pricingToggle');
  if (toggle) toggle.classList.toggle('on', pricingRecurring);
  // Weekly discount = 10%
  const homeBase = CONFIG.rates.home;
  const commBase = CONFIG.rates.commercial;
  const homeWeekly  = Math.round(homeBase * (1 - CONFIG.discounts.weekly / 100) * 100) / 100;
  const commWeekly  = Math.round(commBase * (1 - CONFIG.discounts.weekly / 100) * 100) / 100;
  const rates = pricingRecurring
    ? { home: '£' + homeWeekly, homeNote: 'Weekly · save ' + CONFIG.discounts.weekly + '%', comm: '£' + commWeekly, commNote: 'Weekly · save ' + CONFIG.discounts.weekly + '%', deep: '£32', deepNote: 'Weekly · save 10%' }
    : { home: '£' + CONFIG.displayRates.home, homeNote: 'One-off · min. 3 hrs', comm: '£' + CONFIG.displayRates.commercial, commNote: 'One-off · min. 3 hrs', deep: '£32', deepNote: 'One-off · min. 4 hrs' };
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('home-price', rates.home + '<span>/hr</span>');
  setText('home-note', rates.homeNote);
  set('comm-price', rates.comm + '<span>/hr</span>');
  setText('comm-note', rates.commNote);
  set('deep-price', rates.deep + '<span>/hr</span>');
  setText('deep-note', rates.deepNote);
}

// ═════════════════════════════════════════════
// QUOTE BUILDER / BOOKING FLOW
// ═════════════════════════════════════════════

function isBookingPage() {
  return document.getElementById('quote-step-1') !== null;
}

// ── STEP NAVIGATION ──
function goStep(n) {
  if (n < 1 || n > state.totalSteps) return;
  // Validate current step before advancing
  if (n > state.step && !validateStep(state.step)) return;
  state.step = n;
  renderStep();
}

function renderStep() {
  for (let i = 1; i <= state.totalSteps; i++) {
    const section = document.getElementById('quote-step-' + i);
    const indicator = document.getElementById('step-ind-' + i);
    if (section) section.classList.toggle('active', i === state.step);
    if (indicator) {
      indicator.classList.remove('current', 'done');
      if (i === state.step)    indicator.classList.add('current');
      else if (i < state.step) indicator.classList.add('done');
    }
  }
  // Scroll to top of form
  const formArea = document.querySelector('.quote-form-area');
  if (formArea) formArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  updateSummary();
}

function validateStep(step) {
  switch (step) {
    case 1:
      if (!state.propertyType) {
        showValidation('Please select a property type.');
        return false;
      }
      return true;
    case 2:
      return true; // Size always has defaults
    case 3:
      if (state.hours < CONFIG.minHours) {
        showValidation('Minimum booking is ' + CONFIG.minHours + ' hours.');
        return false;
      }
      // Check if below recommendation and needs explanation
      if (state.hours < state.recMinHrs) {
        const explanation = document.getElementById('below-rec-explanation');
        if (explanation && !explanation.value.trim()) {
          showValidation('Please tell us which areas to prioritise since you selected fewer hours than recommended.');
          explanation.focus();
          return false;
        }
        state.belowRecExplanation = explanation ? explanation.value.trim() : '';
      }
      return true;
    case 4:
      return true; // Extras are optional
    case 5:
      if (!state.bookingDate) {
        showValidation('Please select a booking date.');
        return false;
      }
      // Validate 48hr lead
      const selectedDate = new Date(state.bookingDate + 'T00:00:00');
      const minDate = getMinBookingDate();
      if (selectedDate < minDate) {
        showValidation('We require at least 48 hours\' notice. Please select a later date.');
        return false;
      }
      // Recurring validation
      if (state.frequency !== 'one-off' && state.recurringDays.length === 0) {
        showValidation('Please select at least one preferred day for recurring bookings.');
        return false;
      }
      return true;
    case 6:
      if (!state.customerName.trim()) { showValidation('Please enter your name.'); return false; }
      if (!state.email.trim() || !state.email.includes('@')) { showValidation('Please enter a valid email address.'); return false; }
      if (!state.phone.trim()) { showValidation('Please enter your phone number.'); return false; }
      if (!state.address.trim()) { showValidation('Please enter your address.'); return false; }
      if (!state.postcode.trim()) { showValidation('Please enter your postcode.'); return false; }
      return true;
    case 7:
      return true;
  }
  return true;
}

function showValidation(msg) {
  // Show inline validation toast
  let toast = document.getElementById('validation-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'validation-toast';
    toast.className = 'validation-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ── DATE HELPERS ──
function getMinBookingDate() {
  const now = new Date();
  now.setHours(now.getHours() + CONFIG.minBookingLeadHours);
  // Set to start of that day
  now.setHours(0, 0, 0, 0);
  return now;
}

function getMinBookingDateStr() {
  const d = getMinBookingDate();
  return d.toISOString().split('T')[0];
}

// ── STEP 1: SERVICE CATEGORY + PROPERTY TYPE ──
function selectCategory(cat) {
  state.serviceCategory = cat;
  state.propertyType = '';
  state.selectedExtras = {};
  state.extraTimeMins = 0;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  renderPropertyTypes();
  renderExtrasGrid();
  recalculate();
  updateSummary();
}

function renderPropertyTypes() {
  const container = document.getElementById('property-types-grid');
  if (!container) return;
  const isHome = state.serviceCategory === 'home';
  const types = [
    ...(isHome ? [
      { id: 'studio',  emoji: '🏡', name: 'Studio' },
      { id: '1bed',    emoji: '🛏️', name: '1 Bedroom' },
      { id: '2bed',    emoji: '🏠', name: '2 Bedrooms' },
      { id: '3bed',    emoji: '🏘️', name: '3 Bedrooms' },
      { id: '4bed',    emoji: '🏰', name: '4+ Bedrooms' },
    ] : [
      { id: 'office',     emoji: '🏢', name: 'Office' },
      { id: 'gym',        emoji: '🏋️', name: 'Gym' },
      { id: 'airbnb',     emoji: '🏡', name: 'Airbnb / Short-let' },
      { id: 'salon',      emoji: '💇', name: 'Salon / Barber' },
      { id: 'restaurant', emoji: '🍽️', name: 'Restaurant' },
      { id: 'retail',     emoji: '🛍️', name: 'Retail' },
      { id: 'medical',    emoji: '🏥', name: 'Medical / Clinic' },
      { id: 'other',      emoji: '🏗️', name: 'Other Commercial' },
    ])
  ];
  container.innerHTML = types.map(t =>
    '<div class="prop-type-card' + (state.propertyType === t.id ? ' selected' : '') + '" onclick="selectPropertyType(\'' + t.id + '\')" data-type="' + t.id + '">' +
      '<div class="prop-type-emoji">' + t.emoji + '</div>' +
      '<div class="prop-type-name">' + t.name + '</div>' +
    '</div>'
  ).join('');
}

function selectPropertyType(id) {
  state.propertyType = id;
  // Set defaults
  if (state.serviceCategory === 'home') {
    const bedMap = { studio: 0, '1bed': 1, '2bed': 2, '3bed': 3, '4bed': 4 };
    state.bedrooms = bedMap[id] || 2;
    state.bathrooms = Math.max(1, Math.ceil(state.bedrooms / 2));
  }
  document.querySelectorAll('.prop-type-card').forEach(c => c.classList.toggle('selected', c.dataset.type === id));
  updateSizeInputs();
  recalcRecommendation();
  recalculate();
  updateSummary();
}

// ── STEP 2: SIZE INPUTS ──
function updateSizeInputs() {
  const homeSize = document.getElementById('home-size-inputs');
  const commSize = document.getElementById('commercial-size-inputs');
  if (homeSize) homeSize.style.display = state.serviceCategory === 'home' ? 'block' : 'none';
  if (commSize) commSize.style.display = state.serviceCategory === 'commercial' ? 'block' : 'none';
  // Set input values
  const bedInput = document.getElementById('input-bedrooms');
  const bathInput = document.getElementById('input-bathrooms');
  const sqftInput = document.getElementById('input-sqft');
  if (bedInput) bedInput.value = state.bedrooms;
  if (bathInput) bathInput.value = state.bathrooms;
  if (sqftInput) sqftInput.value = state.sqft;
}

function adjustBedrooms(delta) {
  state.bedrooms = Math.max(0, Math.min(10, state.bedrooms + delta));
  const el = document.getElementById('input-bedrooms');
  if (el) el.value = state.bedrooms;
  recalcRecommendation();
  recalculate();
  updateSummary();
}

function adjustBathrooms(delta) {
  state.bathrooms = Math.max(1, Math.min(8, state.bathrooms + delta));
  const el = document.getElementById('input-bathrooms');
  if (el) el.value = state.bathrooms;
  recalcRecommendation();
  recalculate();
  updateSummary();
}

function updateSqft() {
  const el = document.getElementById('input-sqft');
  if (el) state.sqft = Math.max(100, parseInt(el.value) || 1500);
  recalcRecommendation();
  recalculate();
  updateSummary();
}

function recalcRecommendation() {
  if (state.serviceCategory === 'home') {
    const totalMins = CONFIG.homeTimeBase + (state.bedrooms * CONFIG.homePerBed) + (state.bathrooms * CONFIG.homePerBath);
    const recHrs = Math.round(totalMins / 60 * 2) / 2; // Round to nearest 0.5
    state.recMinHrs = Math.max(CONFIG.minHours, recHrs - 0.5);
    state.recMaxHrs = recHrs + 1;
    state.recDefaultHrs = recHrs;
  } else {
    const rec = CONFIG.commercialRecs.find(r => state.sqft <= r.maxSqft);
    if (rec) {
      state.recMinHrs = rec.recMin;
      state.recMaxHrs = rec.recMax;
      state.recDefaultHrs = rec.recDefault;
    }
  }
  // Auto-set hours if user hasn't manually adjusted
  if (state.hours < state.recMinHrs && state.hours <= CONFIG.minHours) {
    state.hours = Math.max(CONFIG.minHours, state.recDefaultHrs);
  }
  renderRecommendation();
}

function renderRecommendation() {
  const bar = document.getElementById('rec-bar');
  if (!bar) return;
  bar.innerHTML =
    '<div class="rec-icon">💡</div>' +
    '<div class="rec-text"><strong>Recommended:</strong> ' + state.recMinHrs + '–' + state.recMaxHrs + ' hours for this property size</div>';
}

// ── STEP 3: HOURS + FREQUENCY ──
function adjustHours(delta) {
  const step = 0.5;
  state.hours = Math.max(CONFIG.minHours, Math.round((state.hours + delta * step) * 2) / 2);
  const el = document.getElementById('hours-display');
  if (el) el.textContent = state.hours;
  checkBelowRec();
  recalculate();
  updateSummary();
}

function checkBelowRec() {
  const belowRecBox = document.getElementById('below-rec-box');
  if (!belowRecBox) return;
  if (state.hours < state.recMinHrs) {
    belowRecBox.style.display = 'block';
  } else {
    belowRecBox.style.display = 'none';
  }
}

function selectFrequency(freq) {
  state.frequency = freq;
  state.discountPct = CONFIG.discounts[freq] || 0;
  document.querySelectorAll('.freq-card').forEach(c => c.classList.toggle('selected', c.dataset.freq === freq));
  // Show/hide recurring fields
  const recurFields = document.getElementById('recurring-fields');
  if (recurFields) recurFields.style.display = freq === 'one-off' ? 'none' : 'block';
  recalculate();
  updateSummary();
}

// ── STEP 4: EXTRAS ──
function renderExtrasGrid() {
  const container = document.getElementById('extras-grid');
  if (!container) return;
  const isHome = state.serviceCategory === 'home';
  const isAirbnb = state.propertyType === 'airbnb';
  // Airbnb uses home extras
  const extras = (isHome || isAirbnb) ? CONFIG.homeExtras : CONFIG.commercialExtras;
  const shared = CONFIG.sharedExtras;
  let html = '<div class="extras-section-label">Service Extras</div><div class="extras-options">';
  extras.forEach(ex => {
    const rate = isHome || isAirbnb ? CONFIG.rates.home : CONFIG.rates.commercial;
    const cost = Math.round((ex.mins / 60) * rate * 100) / 100;
    const selected = state.selectedExtras[ex.id] ? ' selected' : '';
    html += '<div class="extra-opt' + selected + '" onclick="toggleExtra(\'' + ex.id + '\',' + ex.mins + ')" data-extra="' + ex.id + '">' +
      '<div class="extra-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
      '<div class="extra-emoji">' + ex.emoji + '</div>' +
      '<div class="extra-details">' +
        '<div class="extra-name">' + ex.name + '</div>' +
        '<div class="extra-meta">+' + ex.mins + ' mins · +£' + cost.toFixed(2) + '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  // Shared extras
  html += '<div class="extras-section-label" style="margin-top:24px">Additional Options</div><div class="extras-options">';
  shared.forEach(ex => {
    const rate = isHome || isAirbnb ? CONFIG.rates.home : CONFIG.rates.commercial;
    const cost = Math.round((ex.mins / 60) * rate * 100) / 100;
    const selected = state.selectedExtras[ex.id] ? ' selected' : '';
    html += '<div class="extra-opt' + selected + '" onclick="toggleExtra(\'' + ex.id + '\',' + ex.mins + ')" data-extra="' + ex.id + '">' +
      '<div class="extra-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
      '<div class="extra-emoji">' + ex.emoji + '</div>' +
      '<div class="extra-details">' +
        '<div class="extra-name">' + ex.name + '</div>' +
        '<div class="extra-meta">+' + ex.mins + ' mins · +£' + cost.toFixed(2) + '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function toggleExtra(id, mins) {
  if (state.selectedExtras[id]) {
    delete state.selectedExtras[id];
  } else {
    state.selectedExtras[id] = mins;
  }
  // Update UI
  document.querySelectorAll('.extra-opt').forEach(el => {
    if (el.dataset.extra === id) el.classList.toggle('selected');
  });
  recalculate();
  updateSummary();
}

// ── STEP 5: DATE + TIME ──
function selectTimeWindow(tw) {
  state.timeWindow = tw;
  document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('selected', b.dataset.time === tw));
}

function toggleRecurringDay(day) {
  const idx = state.recurringDays.indexOf(day);
  if (idx === -1) state.recurringDays.push(day);
  else state.recurringDays.splice(idx, 1);
  document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('selected', state.recurringDays.includes(b.dataset.day)));
}

// ── STEP 6: CUSTOMER DETAILS (bound via oninput in HTML) ──

// ── CALCULATION ENGINE ──
function recalculate() {
  const isHome = state.serviceCategory === 'home' || state.propertyType === 'airbnb';
  state.hourlyRate = isHome ? CONFIG.rates.home : CONFIG.rates.commercial;

  // Extra time from add-ons
  let extraMins = 0;
  Object.values(state.selectedExtras).forEach(mins => extraMins += mins);
  state.extraTimeMins = extraMins;
  state.extraHoursTotal = Math.round(extraMins / 60 * 100) / 100;

  // Total hours
  state.baseHoursTotal = state.hours;
  state.totalHours = state.baseHoursTotal + state.extraHoursTotal;

  // Subtotal
  state.subtotal = Math.round(state.totalHours * state.hourlyRate * 100) / 100;

  // Discount
  state.discountPct = CONFIG.discounts[state.frequency] || 0;
  state.discountAmount = Math.round(state.subtotal * state.discountPct / 100 * 100) / 100;

  // Final
  state.finalTotal = Math.round((state.subtotal - state.discountAmount) * 100) / 100;
}

// ── LIVE SUMMARY SIDEBAR ──
function updateSummary() {
  recalculate();
  // Property
  const propEl = document.getElementById('sum-property');
  if (propEl) {
    const propName = getPropertyTypeName();
    propEl.textContent = propName || '—';
  }
  // Category
  const catEl = document.getElementById('sum-category');
  if (catEl) catEl.textContent = state.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning';
  // Rate
  const rateEl = document.getElementById('sum-rate');
  if (rateEl) rateEl.textContent = '£' + state.hourlyRate + '/hr';
  // Base hours
  const hrsEl = document.getElementById('sum-hours');
  if (hrsEl) hrsEl.textContent = state.baseHoursTotal + ' hrs';
  // Extra hours
  const extHrsEl = document.getElementById('sum-extra-hours');
  const extHrsRow = document.getElementById('sum-extra-hours-row');
  if (extHrsEl && extHrsRow) {
    if (state.extraHoursTotal > 0) {
      extHrsRow.style.display = 'flex';
      extHrsEl.textContent = '+' + state.extraHoursTotal.toFixed(1) + ' hrs';
    } else {
      extHrsRow.style.display = 'none';
    }
  }
  // Total hours
  const totalHrsEl = document.getElementById('sum-total-hours');
  if (totalHrsEl) totalHrsEl.textContent = state.totalHours.toFixed(1) + ' hrs';
  // Frequency
  const freqEl = document.getElementById('sum-freq');
  if (freqEl) freqEl.textContent = capitalize(state.frequency);
  // Discount
  const discRow = document.getElementById('sum-discount-row');
  const discEl = document.getElementById('sum-discount');
  if (discRow && discEl) {
    if (state.discountPct > 0) {
      discRow.style.display = 'flex';
      discEl.textContent = '-£' + state.discountAmount.toFixed(2) + ' (' + state.discountPct + '%)';
    } else {
      discRow.style.display = 'none';
    }
  }
  // Extras list
  const extrasListEl = document.getElementById('sum-extras-list');
  const extrasRow = document.getElementById('sum-extras-row');
  if (extrasListEl && extrasRow) {
    const selectedIds = Object.keys(state.selectedExtras);
    if (selectedIds.length > 0) {
      extrasRow.style.display = 'block';
      const allExtras = [...CONFIG.homeExtras, ...CONFIG.commercialExtras, ...CONFIG.sharedExtras];
      extrasListEl.innerHTML = selectedIds.map(id => {
        const ex = allExtras.find(e => e.id === id);
        return ex ? '<span class="sum-extra-tag">' + ex.emoji + ' ' + ex.name + '</span>' : '';
      }).join('');
    } else {
      extrasRow.style.display = 'none';
    }
  }
  // Total
  const totalEl = document.getElementById('sum-total');
  if (totalEl) totalEl.textContent = '£' + state.finalTotal.toFixed(2);
  // Per visit note
  const perVisitEl = document.getElementById('sum-per-visit');
  if (perVisitEl) perVisitEl.textContent = state.frequency === 'one-off' ? 'One-off clean' : 'Per visit · ' + capitalize(state.frequency);
}

// ── STEP 7: REVIEW + PAY ──
function renderReview() {
  const container = document.getElementById('review-content');
  if (!container) return;
  const allExtras = [...CONFIG.homeExtras, ...CONFIG.commercialExtras, ...CONFIG.sharedExtras];
  const selectedExtras = Object.keys(state.selectedExtras).map(id => allExtras.find(e => e.id === id)).filter(Boolean);

  let dateStr = '';
  if (state.bookingDate) {
    const d = new Date(state.bookingDate + 'T00:00:00');
    dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const timeLabels = { morning: 'Morning (8am–12pm)', afternoon: 'Afternoon (12pm–5pm)', evening: 'Evening (5pm–8pm)' };

  let html = '<div class="review-grid">';
  // Contact
  html += '<div class="review-section"><h4>Your Details</h4>';
  html += '<div class="review-row"><span>Name</span><strong>' + esc(state.customerName) + '</strong></div>';
  if (state.companyName) html += '<div class="review-row"><span>Company</span><strong>' + esc(state.companyName) + '</strong></div>';
  html += '<div class="review-row"><span>Email</span><strong>' + esc(state.email) + '</strong></div>';
  html += '<div class="review-row"><span>Phone</span><strong>' + esc(state.phone) + '</strong></div>';
  html += '<div class="review-row"><span>Address</span><strong>' + esc(state.address) + ', ' + esc(state.postcode) + '</strong></div>';
  if (state.accessInstructions) html += '<div class="review-row"><span>Access</span><strong>' + esc(state.accessInstructions) + '</strong></div>';
  html += '</div>';
  // Service
  html += '<div class="review-section"><h4>Service Details</h4>';
  html += '<div class="review-row"><span>Service</span><strong>' + (state.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning') + '</strong></div>';
  html += '<div class="review-row"><span>Property</span><strong>' + getPropertyTypeName() + '</strong></div>';
  if (state.serviceCategory === 'home') {
    html += '<div class="review-row"><span>Size</span><strong>' + state.bedrooms + ' bed / ' + state.bathrooms + ' bath</strong></div>';
  } else {
    html += '<div class="review-row"><span>Size</span><strong>' + state.sqft.toLocaleString() + ' sq ft</strong></div>';
  }
  html += '<div class="review-row"><span>Recommended</span><strong>' + state.recMinHrs + '–' + state.recMaxHrs + ' hours</strong></div>';
  html += '<div class="review-row"><span>Booked Hours</span><strong>' + state.baseHoursTotal + ' hours</strong></div>';
  if (state.extraHoursTotal > 0) {
    html += '<div class="review-row"><span>Extra Time</span><strong>+' + state.extraHoursTotal.toFixed(1) + ' hours (add-ons)</strong></div>';
    html += '<div class="review-row"><span>Total Time</span><strong>' + state.totalHours.toFixed(1) + ' hours</strong></div>';
  }
  html += '<div class="review-row"><span>Frequency</span><strong>' + capitalize(state.frequency) + '</strong></div>';
  html += '</div>';
  // Extras
  if (selectedExtras.length > 0) {
    html += '<div class="review-section"><h4>Selected Extras</h4>';
    selectedExtras.forEach(ex => {
      const cost = Math.round((ex.mins / 60) * state.hourlyRate * 100) / 100;
      html += '<div class="review-row"><span>' + ex.emoji + ' ' + ex.name + '</span><strong>+' + ex.mins + 'min · £' + cost.toFixed(2) + '</strong></div>';
    });
    html += '</div>';
  }
  // Schedule
  html += '<div class="review-section"><h4>Schedule</h4>';
  html += '<div class="review-row"><span>Date</span><strong>' + dateStr + '</strong></div>';
  html += '<div class="review-row"><span>Time</span><strong>' + (timeLabels[state.timeWindow] || state.timeWindow) + '</strong></div>';
  if (state.frequency !== 'one-off' && state.recurringDays.length) {
    html += '<div class="review-row"><span>Recurring Days</span><strong>' + state.recurringDays.map(capitalize).join(', ') + '</strong></div>';
  }
  html += '</div>';
  // Pricing
  html += '<div class="review-section review-pricing"><h4>Pricing Summary</h4>';
  html += '<div class="review-row"><span>Hourly Rate</span><strong>£' + state.hourlyRate + '/hr</strong></div>';
  html += '<div class="review-row"><span>Total Time</span><strong>' + state.totalHours.toFixed(1) + ' hrs</strong></div>';
  html += '<div class="review-row"><span>Subtotal</span><strong>£' + state.subtotal.toFixed(2) + '</strong></div>';
  if (state.discountPct > 0) {
    html += '<div class="review-row discount"><span>' + capitalize(state.frequency) + ' Discount (' + state.discountPct + '%)</span><strong>-£' + state.discountAmount.toFixed(2) + '</strong></div>';
  }
  html += '<div class="review-total"><span>Total Due</span><strong>£' + state.finalTotal.toFixed(2) + '</strong></div>';
  html += '</div>';
  html += '</div>';
  // Note
  html += '<div class="review-note">Your booking is only confirmed once payment is received. You can cancel or reschedule free of charge with at least 24 hours\' notice.</div>';
  container.innerHTML = html;
}

// ── PAY NOW → STRIPE ──
async function initiatePayment() {
  const payBtn = document.getElementById('pay-now-btn');
  const loadingEl = document.getElementById('pay-loading');
  if (payBtn) payBtn.disabled = true;
  if (loadingEl) loadingEl.style.display = 'flex';

  // Terms check
  const terms = document.getElementById('terms-check');
  if (terms && !terms.checked) {
    showValidation('Please agree to the Terms & Conditions to proceed.');
    if (payBtn) payBtn.disabled = false;
    if (loadingEl) loadingEl.style.display = 'none';
    return;
  }

  const allExtras = [...CONFIG.homeExtras, ...CONFIG.commercialExtras, ...CONFIG.sharedExtras];
  const selectedExtras = Object.keys(state.selectedExtras).map(id => {
    const ex = allExtras.find(e => e.id === id);
    return ex ? { id: ex.id, name: ex.name, mins: ex.mins } : null;
  }).filter(Boolean);

  const payload = {
    serviceCategory: state.serviceCategory,
    propertyType: state.propertyType,
    bedrooms: state.bedrooms,
    bathrooms: state.bathrooms,
    sqft: state.sqft,
    hours: state.baseHoursTotal,
    extraHours: state.extraHoursTotal,
    totalHours: state.totalHours,
    frequency: state.frequency,
    selectedExtras: selectedExtras,
    bookingDate: state.bookingDate,
    timeWindow: state.timeWindow,
    recurringDays: state.recurringDays,
    customerName: state.customerName,
    companyName: state.companyName,
    email: state.email,
    phone: state.phone,
    address: state.address,
    postcode: state.postcode,
    accessInstructions: state.accessInstructions,
    belowRecExplanation: state.belowRecExplanation,
    hourlyRate: state.hourlyRate,
    discountPct: state.discountPct,
    recMinHrs: state.recMinHrs,
    recMaxHrs: state.recMaxHrs,
    finalTotal: state.finalTotal,
  };

  try {
    const resp = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showValidation(data.error || 'Something went wrong. Please try again.');
      if (payBtn) payBtn.disabled = false;
      if (loadingEl) loadingEl.style.display = 'none';
    }
  } catch (err) {
    showValidation('Connection error. Please check your internet and try again.');
    if (payBtn) payBtn.disabled = false;
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// ── HELPERS ──
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function getPropertyTypeName() {
  const all = {
    studio: 'Studio', '1bed': '1 Bedroom', '2bed': '2 Bedrooms', '3bed': '3 Bedrooms', '4bed': '4+ Bedrooms',
    office: 'Office', gym: 'Gym', airbnb: 'Airbnb / Short-let', salon: 'Salon / Barber',
    restaurant: 'Restaurant / Hospitality', retail: 'Retail', medical: 'Medical / Clinic', other: 'Other Commercial',
  };
  return all[state.propertyType] || '';
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', function() {
  if (isBookingPage()) {
    renderPropertyTypes();
    updateSizeInputs();
    recalcRecommendation();
    renderExtrasGrid();
    recalculate();
    updateSummary();
    renderStep();
    // Set min date on date input
    const dateInput = document.getElementById('booking-date');
    if (dateInput) dateInput.min = getMinBookingDateStr();
  }

  // Scroll-reveal animation
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(
    '.step-card, .service-card, .trust-card, .testi-card, .pricing-card, .value-card, .cleaner-card, .addon-card'
  ).forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
});
