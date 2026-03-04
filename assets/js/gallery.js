/**
 * gallery.js — AEA/MTI Hackathon 2
 *
 * Fetches submissions from three Google Sheets gviz/tq endpoints (CORS-safe),
 * merges and sorts them, renders gallery cards, and auto-refreshes
 * every 60 seconds. Supports filter buttons (path + option).
 */

// ============================================================================
// CONFIGURATION — update these after deployment
// ============================================================================

// Critique sheet — gviz JSON feed (supports CORS, no CSV CORB issues)
const SHEET_GVIZ_URL_CRITIQUE = 'https://docs.google.com/spreadsheets/d/1jbMsChNJ9OQzOXdqRRzhLrFh2NPbAqpfKBy_5pkE_QE/gviz/tq?tqx=out:json&gid=1091433995';

// Create sheet
const SHEET_GVIZ_URL_CREATE = 'https://docs.google.com/spreadsheets/d/1jbMsChNJ9OQzOXdqRRzhLrFh2NPbAqpfKBy_5pkE_QE/gviz/tq?tqx=out:json&gid=1317074835';

// Collab sheet
const SHEET_GVIZ_URL_COLLAB = 'https://docs.google.com/spreadsheets/d/1jbMsChNJ9OQzOXdqRRzhLrFh2NPbAqpfKBy_5pkE_QE/gviz/tq?tqx=out:json&gid=2115396050';

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
let modalTrigger = null;      // Element that opened the modal (for focus restore)

// ============================================================================
// Gviz JSON parser
// The gviz endpoint wraps JSON in a callback — strip it, then extract rows.
// Returns string[][] matching the column order of the sheet (no header row).
// ============================================================================

function parseGviz(text) {
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  const data  = JSON.parse(text.slice(start, end + 1));
  return (data.table.rows || []).map(row =>
    (row.c || []).map(cell => (cell && cell.v != null) ? String(cell.v) : '')
  );
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
// Fetch + parse one gviz sheet → returns string[][]
// ============================================================================

async function fetchGviz(url) {
  const response = await fetch(url + '&t=' + Date.now());
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return parseGviz(await response.text());
}

// ============================================================================
// Parse / format timestamps
// gviz returns datetimes as "Date(year,month,day,h,m,s)" — handle both that
// and plain date strings for sorting and display.
// ============================================================================

function parseTimestamp(ts) {
  if (!ts) return new Date(0);
  const m = typeof ts === 'string' && ts.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (m) return new Date(+m[1], +m[2], +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  return new Date(ts);
}

function formatTimestamp(ts) {
  if (!ts) return '';
  // gviz returns datetimes as "Date(year,month,day,h,m,s)"
  const m = typeof ts === 'string' && ts.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (m) {
    const d = new Date(+m[1], +m[2], +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
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

  // Evidence (truncated) — sub.evidence for Critique/Create, changelog for Collab
  const evidenceRaw = sub.type === 'collab' ? sub.changelog : sub.evidence;
  if (evidenceRaw && evidenceRaw.trim()) {
    const evidenceText = sub.type === 'collab'
      ? evidenceRaw.split('\n')
          .map(l => l.replace(/^[\u2022\-\*]\s*/, '').trim())
          .filter(Boolean)
          .map(b => '• ' + b)
          .join('\n')
      : evidenceRaw;

    const evWrap = document.createElement('div');
    evWrap.className = 'gallery-card__evidence-wrap';

    const evEl = document.createElement('p');
    evEl.className = 'gallery-card__evidence';
    evEl.textContent = evidenceText;

    const evFade = document.createElement('div');
    evFade.className = 'gallery-card__evidence-fade';
    evFade.setAttribute('aria-hidden', 'true');

    evWrap.appendChild(evEl);
    evWrap.appendChild(evFade);
    body.appendChild(evWrap);

    const readMore = document.createElement('button');
    readMore.className = 'gallery-card__read-more';
    readMore.type = 'button';
    readMore.textContent = 'Read more \u2192';
    readMore.addEventListener('click', () => openModal(sub, readMore));
    body.appendChild(readMore);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'gallery-card__footer';

  const ts = document.createElement('span');
  ts.className = 'gallery-card__timestamp';
  ts.textContent = formatTimestamp(sub.timestamp);

  footer.appendChild(ts);

  if (sub.type === 'collab') {
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
    fetchGviz(SHEET_GVIZ_URL_CRITIQUE),
    fetchGviz(SHEET_GVIZ_URL_CREATE),
    fetchGviz(SHEET_GVIZ_URL_COLLAB),
  ]);

  const merged = [];

  // Process Sheet 1 (Critique) — gviz returns data rows only (no header)
  if (results[0].status === 'fulfilled') {
    const rows = results[0].value;
    lastRowCountCritique = rows.length;
    rows.forEach(cols => {
      const sub = parseMainRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Process Sheet 2 (Create)
  if (results[1].status === 'fulfilled') {
    const rows = results[1].value;
    lastRowCountCreate = rows.length;
    rows.forEach(cols => {
      const sub = parseMainRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Process Sheet 3 (Collab)
  if (results[2].status === 'fulfilled') {
    const rows = results[2].value;
    lastRowCountCollab = rows.length;
    rows.forEach(cols => {
      const sub = parseCollabRow(cols);
      if (sub && sub.name && sub.claim) merged.push(sub);
    });
  }

  // Sort by timestamp descending (newest first)
  merged.sort((a, b) => {
    const da = parseTimestamp(a.timestamp);
    const db = parseTimestamp(b.timestamp);
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
// Modal — open / populate / close
// ============================================================================

function makeModalSection(labelText) {
  const sec = document.createElement('div');
  sec.className = 'modal-section';
  const label = document.createElement('p');
  label.className = 'modal-label';
  label.textContent = labelText;
  sec.appendChild(label);
  return sec;
}

function openModal(sub, triggerEl) {
  const modal   = document.getElementById('gallery-modal');
  const content = document.getElementById('modal-content');

  const path = (sub.path || '').toLowerCase();
  const pathClass = path === 'critique' ? 'critique'
                  : path === 'create'   ? 'create'
                  : 'collab';

  modal.className = `gallery-modal gallery-modal--${pathClass}`;
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  modalTrigger = triggerEl || null;

  content.innerHTML = '';

  // Badges
  const badgesEl = document.createElement('div');
  badgesEl.className = 'modal-badges';
  const pathBadge = document.createElement('span');
  pathBadge.className = `badge badge--${pathClass}`;
  pathBadge.textContent = sub.path || '';
  badgesEl.appendChild(pathBadge);
  if (sub.option) {
    const optBadge = document.createElement('span');
    optBadge.className = 'badge badge--option';
    optBadge.textContent = sub.option;
    badgesEl.appendChild(optBadge);
  }
  content.appendChild(badgesEl);

  // Name
  const nameEl = document.createElement('p');
  nameEl.className = 'modal-name';
  nameEl.textContent = sub.name || 'Anonymous';
  content.appendChild(nameEl);

  // Claim
  const claimEl = document.createElement('p');
  claimEl.className = 'modal-claim';
  claimEl.id = 'modal-claim';
  claimEl.textContent = sub.claim || '';
  content.appendChild(claimEl);

  if (sub.type === 'collab') {
    // Full changelog
    if (sub.changelog) {
      const sec = makeModalSection('What changed (change-log)');
      const bullets = sub.changelog.split('\n')
        .map(l => l.replace(/^[\u2022\-\*]\s*/, '').trim())
        .filter(Boolean)
        .map(b => '• ' + b)
        .join('\n');
      const text = document.createElement('p');
      text.className = 'modal-text';
      text.textContent = bullets;
      sec.appendChild(text);
      content.appendChild(sec);
    }

    // Based-on template link
    if (sub.templateLink) {
      const sec = makeModalSection('Based on');
      const link = document.createElement('a');
      link.href = sub.templateLink;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'modal-link';
      link.textContent = 'View original template \u2192';
      sec.appendChild(link);
      content.appendChild(sec);
    }
  } else {
    // Full evidence of work
    if (sub.evidence) {
      const sec = makeModalSection('Evidence of work');
      const text = document.createElement('p');
      text.className = 'modal-text';
      text.textContent = sub.evidence;
      sec.appendChild(text);
      content.appendChild(sec);
    }

    // Reflection
    if (sub.reflection) {
      const sec = makeModalSection('Reflection');
      const text = document.createElement('p');
      text.className = 'modal-reflection';
      text.textContent = '\u201C' + sub.reflection + '\u201D';
      sec.appendChild(text);
      content.appendChild(sec);
    }
  }

  // Footer: timestamp + primary link
  const foot = document.createElement('div');
  foot.className = 'modal-footer';

  const tsEl = document.createElement('span');
  tsEl.className = 'modal-timestamp';
  tsEl.textContent = formatTimestamp(sub.timestamp);
  foot.appendChild(tsEl);

  const linkHref = sub.type === 'collab' ? sub.remixLink : sub.link;
  const linkText = sub.type === 'collab' ? 'Open Remix \u2192' : 'View output \u2192';
  if (linkHref) {
    const link = document.createElement('a');
    link.href = linkHref;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'modal-link';
    link.textContent = linkText;
    foot.appendChild(link);
  }

  content.appendChild(foot);

  document.getElementById('modal-close').focus();
}

function closeModal() {
  const modal = document.getElementById('gallery-modal');
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
  if (modalTrigger) {
    modalTrigger.focus();
    modalTrigger = null;
  }
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

  // Modal: close button, backdrop click, Escape key, focus trap
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('gallery-modal');
    if (modal.hasAttribute('hidden')) return;

    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = Array.from(modal.querySelectorAll('button, a[href]'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

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
