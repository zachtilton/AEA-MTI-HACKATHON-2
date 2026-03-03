/**
 * gallery.js — AEA/MTI Hackathon 2
 *
 * Fetches submissions from three published Google Sheet CSV endpoints,
 * merges and sorts them, renders gallery cards, and auto-refreshes
 * every 60 seconds. Supports filter buttons (path + option).
 *
 * SETUP: Replace the three SHEET_CSV_URL constants below with real URLs
 * after publishing your Google Sheet tabs as CSV.
 */

// ============================================================================
// CONFIGURATION — update these after deployment
// ============================================================================

// PLACEHOLDER: replace with the CSV publish URL for the Critique sheet
// To get this URL: File → Share → Publish to web → Critique tab → CSV → Copy link
const SHEET_CSV_URL_CRITIQUE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQtSDpjQqmc5_9FpqUhmw4oaZ6iUhZdmoGZtsUifVXvjFs_VELMUfg_yNSNflo49QX_PmQ7FCmusjf-/pub?gid=1091433995&single=true&output=csv';

// PLACEHOLDER: replace with the CSV publish URL for the Create sheet
// To get this URL: File → Share → Publish to web → Create tab → CSV → Copy link
const SHEET_CSV_URL_CREATE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQtSDpjQqmc5_9FpqUhmw4oaZ6iUhZdmoGZtsUifVXvjFs_VELMUfg_yNSNflo49QX_PmQ7FCmusjf-/pub?gid=1317074835&single=true&output=csv';

// PLACEHOLDER: replace with the CSV publish URL for the Collab sheet
// To get this URL: File → Share → Publish to web → Collab tab → CSV → Copy link
const SHEET_CSV_URL_COLLAB = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQtSDpjQqmc5_9FpqUhmw4oaZ6iUhZdmoGZtsUifVXvjFs_VELMUfg_yNSNflo49QX_PmQ7FCmusjf-/pub?gid=2115396050&single=true&output=csv';

// How often to poll for new submissions (milliseconds)
const REFRESH_INTERVAL_MS = 60_000;

// ============================================================================
// State
// ============================================================================

let allSubmissions = [];      // Merged, parsed data from all sheets
let activePathFilter = 'All'; // Current primary filter
let activeSubFilter = 'All';  // Current secondary (option) filter
let pollTimer = null;
let lastRowCountCritique = 0;
let lastRowCountCreate   = 0;
let lastRowCountCollab   = 0;

// ============================================================================
// CSV Parser
// A minimal RFC-4180-compliant parser that handles quoted fields.
// ============================================================================

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        // skip \r in \r\n
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Last field / row (file may not end with newline)
  if (field || row.length) {
    row.push(field);
    if (row.some(f => f.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

// ============================================================================
// Row → Submission object
// ============================================================================

// Sheet 1 columns: A=Timestamp B=Name C=Path D=Option E=Claim F=Evidence G=Link H=Ethics I=Reflection
function parseMainRow(cols) {
  if (cols.length < 9) return null;
  return {
    type:       'main',
    timestamp:  cols[0].trim(),
    name:       cols[1].trim(),
    path:       cols[2].trim(),
    option:     cols[3].trim(),
    claim:      cols[4].trim(),
    evidence:   cols[5].trim(),
    link:       cols[6].trim(),
    ethics:     cols[7].trim(),
    reflection: cols[8].trim(),
  };
}

// Sheet 2 columns: A=Timestamp B=Name C=Claim D=TemplateLink E=Changelog F=RemixLink G=Ethics H=Reflection
function parseCollabRow(cols) {
  if (cols.length < 8) return null;
  return {
    type:         'collab',
    timestamp:    cols[0].trim(),
    name:         cols[1].trim(),
    path:         'Collab',
    option:       'Craft a Remix',
    claim:        cols[2].trim(),
    templateLink: cols[3].trim(),
    changelog:    cols[4].trim(),
    remixLink:    cols[5].trim(),
    ethics:       cols[6].trim(),
    reflection:   cols[7].trim(),
  };
}

// ============================================================================
// Fetch + parse one sheet
// ============================================================================

async function fetchSheet(url) {
  const cacheBust = `&t=${Date.now()}`;
  const response = await fetch(url + cacheBust);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return response.text();
}

// ============================================================================
// Format a timestamp for display
// ============================================================================

function formatTimestamp(ts) {
  if (!ts) return '';
  // Google Sheets timestamps are typically "M/D/YYYY HH:MM:SS"
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================================
// Build a card element for one submission
// ============================================================================

function buildCard(sub) {
  const path = (sub.path || 'Critique').toLowerCase();
  const pathClass = path === 'critique' ? 'critique'
                  : path === 'create'   ? 'create'
                  : 'collab';

  const article = document.createElement('article');
  article.className = `gallery-card gallery-card--${pathClass}`;
  article.dataset.path   = sub.path;
  article.dataset.option = sub.option;

  const topStripe = document.createElement('div');
  topStripe.className = 'gallery-card__top';
  topStripe.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'gallery-card__body';

  // Badges
  const badges = document.createElement('div');
  badges.className = 'gallery-card__badges';

  const pathBadge = document.createElement('span');
  pathBadge.className = `badge badge--${pathClass}`;
  pathBadge.textContent = sub.path || 'Unknown';

  const optBadge = document.createElement('span');
  optBadge.className = 'badge badge--option';
  optBadge.textContent = sub.option || '';

  badges.appendChild(pathBadge);
  if (sub.option) badges.appendChild(optBadge);

  // Name
  const nameEl = document.createElement('p');
  nameEl.className = 'gallery-card__name';
  nameEl.textContent = sub.name || 'Anonymous';

  // Claim
  const claimEl = document.createElement('p');
  claimEl.className = 'gallery-card__claim';
  claimEl.textContent = sub.claim || '';

  body.appendChild(badges);
  body.appendChild(nameEl);
  body.appendChild(claimEl);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'gallery-card__footer';

  const ts = document.createElement('span');
  ts.className = 'gallery-card__timestamp';
  ts.textContent = formatTimestamp(sub.timestamp);

  footer.appendChild(ts);

  if (sub.type === 'collab') {
    // Collab-specific: changelog + remix link instead of reflection
    if (sub.changelog) {
      const clDiv = document.createElement('div');
      clDiv.className = 'gallery-card__changelog';
      const clTitle = document.createElement('p');
      clTitle.className = 'gallery-card__changelog-title';
      clTitle.textContent = 'What changed';
      clDiv.appendChild(clTitle);
      // Render each bullet
      const bullets = sub.changelog
        .split('\n')
        .map(l => l.replace(/^[\u2022\-\*]\s*/, '').trim())
        .filter(Boolean);
      bullets.forEach(bullet => {
        const p = document.createElement('p');
        p.textContent = '• ' + bullet;
        clDiv.appendChild(p);
      });
      body.appendChild(clDiv);
    }

    if (sub.templateLink) {
      const basedOn = document.createElement('p');
      basedOn.style.cssText = 'font-size: var(--text-xs); color: var(--color-muted); margin-top: var(--space-xs);';
      const link = document.createElement('a');
      link.href = sub.templateLink;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Based on: original template';
      basedOn.appendChild(link);
      body.appendChild(basedOn);
    }

    if (sub.remixLink) {
      const remixLink = document.createElement('a');
      remixLink.href = sub.remixLink;
      remixLink.target = '_blank';
      remixLink.rel = 'noopener';
      remixLink.className = 'gallery-card__link';
      remixLink.innerHTML = 'Open Remix &rarr;';
      footer.appendChild(remixLink);
    }
  } else {
    // Critique / Create
    if (sub.reflection) {
      const reflEl = document.createElement('p');
      reflEl.className = 'gallery-card__reflection';
      reflEl.textContent = '\u201C' + sub.reflection + '\u201D';
      body.appendChild(reflEl);
    }

    if (sub.link) {
      const viewLink = document.createElement('a');
      viewLink.href = sub.link;
      viewLink.target = '_blank';
      viewLink.rel = 'noopener';
      viewLink.className = 'gallery-card__link';
      viewLink.innerHTML = 'View output &rarr;';
      footer.appendChild(viewLink);
    }
  }

  article.appendChild(topStripe);
  article.appendChild(body);
  article.appendChild(footer);

  return article;
}

// ============================================================================
// Skeleton cards (shown on initial load)
// ============================================================================

function buildSkeleton() {
  const div = document.createElement('div');
  div.className = 'skeleton-card';
  div.innerHTML = `
    <div class="skeleton-line skeleton-line--short" style="margin-bottom: 1rem;"></div>
    <div class="skeleton-line skeleton-line--medium skeleton-line--tall" style="margin-bottom: 0.75rem;"></div>
    <div class="skeleton-line skeleton-line--long" style="margin-bottom: 0.5rem;"></div>
    <div class="skeleton-line skeleton-line--full" style="margin-bottom: 0.5rem;"></div>
    <div class="skeleton-line skeleton-line--medium" style="margin-top: 1.5rem;"></div>
  `;
  return div;
}

function showSkeletons(grid, count = 6) {
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    grid.appendChild(buildSkeleton());
  }
}

// ============================================================================
// Render cards (applying current filters)
// ============================================================================

function renderCards(grid) {
  if (allSubmissions.length === 0) {
    grid.innerHTML = `
      <div class="gallery-empty" role="status">
        <div class="gallery-empty__icon" aria-hidden="true">&#128203;</div>
        <h2 class="gallery-empty__title">No submissions yet</h2>
        <p>Be the first! <a href="index.html#choose-path">Choose a path and submit your entry &rarr;</a></p>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  let visibleCount = 0;

  allSubmissions.forEach(sub => {
    const card = buildCard(sub);

    // Apply filter visibility
    const pathMatch = activePathFilter === 'All' || sub.path === activePathFilter;
    const optMatch  = activeSubFilter  === 'All' || sub.option === activeSubFilter;

    if (!pathMatch || !optMatch) {
      card.classList.add('is-hidden');
    } else {
      visibleCount++;
    }

    grid.appendChild(card);
  });

  // Show empty state if filters produce no results
  if (visibleCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'gallery-empty';
    empty.setAttribute('role', 'status');
    empty.innerHTML = `
      <div class="gallery-empty__icon" aria-hidden="true">&#128269;</div>
      <h2 class="gallery-empty__title">No entries match this filter</h2>
      <p>Try <button class="btn btn--ghost btn--sm" id="clear-filters">clearing the filter</button> to see all submissions.</p>
    `;
    grid.appendChild(empty);
    const clearBtn = grid.querySelector('#clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => resetFilters());
    }
  }
}

// ============================================================================
// Update header count + timestamp
// ============================================================================

function updateMeta(countEl, timestampEl) {
  if (countEl) {
    countEl.textContent = `${allSubmissions.length} ${allSubmissions.length === 1 ? 'submission' : 'submissions'}`;
  }
  if (timestampEl) {
    const now = new Date();
    timestampEl.textContent = 'Last updated ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

// ============================================================================
// Filter logic
// ============================================================================

function applyFilter(pathFilter, subFilter, grid, filterBtns, subFilterBtns) {
  activePathFilter = pathFilter;
  activeSubFilter  = subFilter;

  // Update primary filter button states
  filterBtns.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.filter === pathFilter);
  });

  // Update sub-filter button states
  if (subFilterBtns) {
    subFilterBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.subfilter === subFilter);
    });
  }

  // Update visible cards
  const cards = grid.querySelectorAll('.gallery-card');
  let hasVisible = false;

  cards.forEach(card => {
    const pathMatch = pathFilter === 'All' || card.dataset.path === pathFilter;
    const optMatch  = subFilter  === 'All' || card.dataset.option === subFilter;
    const visible = pathMatch && optMatch;
    card.classList.toggle('is-hidden', !visible);
    if (visible) hasVisible = true;
  });

  // Re-render empty state if needed
  const existingEmpty = grid.querySelector('.gallery-empty');
  if (!hasVisible && allSubmissions.length > 0) {
    if (!existingEmpty) {
      const empty = document.createElement('div');
      empty.className = 'gallery-empty';
      empty.setAttribute('role', 'status');
      empty.innerHTML = `
        <div class="gallery-empty__icon" aria-hidden="true">&#128269;</div>
        <h2 class="gallery-empty__title">No entries match this filter</h2>
        <p><button class="btn btn--ghost btn--sm" id="clear-filters">Clear filters</button></p>
      `;
      grid.appendChild(empty);
      grid.querySelector('#clear-filters')?.addEventListener('click', () => resetFilters(grid, filterBtns, subFilterBtns));
    }
  } else if (existingEmpty) {
    existingEmpty.remove();
  }
}

function resetFilters(grid, filterBtns, subFilterBtns) {
  applyFilter('All', 'All', grid, filterBtns, subFilterBtns);
}

// ============================================================================
// Fetch + merge all three sheets, update state
// ============================================================================

async function fetchAndMerge() {
  const results = await Promise.allSettled([
    fetchSheet(SHEET_CSV_URL_CRITIQUE),
    fetchSheet(SHEET_CSV_URL_CREATE),
    fetchSheet(SHEET_CSV_URL_COLLAB),
  ]);

  const merged = [];

  // Process Sheet 1 (Critique)
  if (results[0].status === 'fulfilled') {
    const rows = parseCSV(results[0].value);
    // Skip header row (row 0)
    const dataRows = rows.slice(1);
    lastRowCountCritique = dataRows.length;
    dataRows.forEach(cols => {
      const sub = parseMainRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Process Sheet 2 (Create)
  if (results[1].status === 'fulfilled') {
    const rows = parseCSV(results[1].value);
    const dataRows = rows.slice(1);
    lastRowCountCreate = dataRows.length;
    dataRows.forEach(cols => {
      const sub = parseMainRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Process Sheet 3 (Collab)
  if (results[2].status === 'fulfilled') {
    const rows = parseCSV(results[2].value);
    const dataRows = rows.slice(1);
    lastRowCountCollab = dataRows.length;
    dataRows.forEach(cols => {
      const sub = parseCollabRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Sort by timestamp descending (newest first)
  merged.sort((a, b) => {
    const da = new Date(a.timestamp);
    const db = new Date(b.timestamp);
    return db - da;
  });

  return merged;
}

// ============================================================================
// Initial load
// ============================================================================

async function initialLoad(grid, countEl, timestampEl) {
  showSkeletons(grid, 6);

  try {
    allSubmissions = await fetchAndMerge();
    renderCards(grid);
    updateMeta(countEl, timestampEl);
  } catch (err) {
    console.error('Gallery: initial load failed', err);
    grid.innerHTML = `
      <div class="gallery-error" role="alert">
        <strong>Could not load submissions.</strong> Please refresh the page or try again shortly.
      </div>
    `;
  }
}

// ============================================================================
// Poll (check for new submissions, re-render if changed)
// ============================================================================

async function poll(grid, countEl, timestampEl) {
  try {
    const fresh = await fetchAndMerge();

    // Only re-render if the count has changed
    if (fresh.length !== allSubmissions.length) {
      allSubmissions = fresh;
      renderCards(grid);
    }
    // Always update timestamp
    updateMeta(countEl, timestampEl);
  } catch (err) {
    // Silent on poll failure — don't disrupt the gallery
    console.warn('Gallery: poll failed', err);
  }
}

// ============================================================================
// Sub-filter chip builder (populated from current submissions)
// ============================================================================

function buildSubFilterChips(container, grid, filterBtns) {
  // Collect unique options
  const options = [...new Set(allSubmissions.map(s => s.option).filter(Boolean))].sort();

  container.innerHTML = '';

  if (options.length === 0) return;

  const label = document.createElement('span');
  label.className = 'filter-label';
  label.textContent = 'Option:';
  container.appendChild(label);

  const allChip = document.createElement('button');
  allChip.className = 'filter-btn is-active';
  allChip.dataset.subfilter = 'All';
  allChip.textContent = 'All';
  allChip.setAttribute('aria-pressed', 'true');
  container.appendChild(allChip);

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.subfilter = opt;
    btn.textContent = opt;
    btn.setAttribute('aria-pressed', 'false');
    container.appendChild(btn);
  });

  const subFilterBtns = container.querySelectorAll('.filter-btn');

  container.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    subFilterBtns.forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
    applyFilter(activePathFilter, btn.dataset.subfilter, grid, filterBtns, subFilterBtns);
  });

  return subFilterBtns;
}

// ============================================================================
// Entry point — called by gallery.html on DOMContentLoaded
// ============================================================================

function initGallery() {
  const grid        = document.getElementById('gallery-grid');
  const countEl     = document.getElementById('gallery-count');
  const timestampEl = document.getElementById('gallery-timestamp');
  const filterBar   = document.getElementById('filter-bar-primary');
  const subFilterBar= document.getElementById('filter-bar-secondary');

  if (!grid) {
    console.error('Gallery: #gallery-grid not found');
    return;
  }

  // Primary filter buttons (All / Critique / Create / Collab)
  const filterBtns = filterBar ? filterBar.querySelectorAll('.filter-btn') : [];

  if (filterBar) {
    filterBar.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBtns.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');

      // Reset sub-filter when path changes
      activeSubFilter = 'All';
      const subBtns = subFilterBar ? subFilterBar.querySelectorAll('.filter-btn') : [];
      subBtns.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      const allSubBtn = subFilterBar ? subFilterBar.querySelector('[data-subfilter="All"]') : null;
      if (allSubBtn) {
        allSubBtn.classList.add('is-active');
        allSubBtn.setAttribute('aria-pressed', 'true');
      }

      applyFilter(btn.dataset.filter, 'All', grid, filterBtns, subBtns);
    });
  }

  // Initial load then start polling
  initialLoad(grid, countEl, timestampEl).then(() => {
    // Build sub-filter chips from loaded data
    let subFilterBtns = [];
    if (subFilterBar) {
      subFilterBtns = buildSubFilterChips(subFilterBar, grid, filterBtns) || [];
    }

    // Start 60-second poll
    pollTimer = setInterval(() => poll(grid, countEl, timestampEl), REFRESH_INTERVAL_MS);
  });
}
