// Token Radar's dark dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and the two set-aside views. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'candidates', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = age <= model.maturity_peak_days
      ? model.maturity_floor + (1 - model.maturity_floor) * (Math.max(age, 0) / model.maturity_peak_days)
      : 1 - model.maturity_ease * (Math.min(age - model.maturity_peak_days, model.maturity_ease_days) / model.maturity_ease_days);
    var reach = 1 + model.reach_per_chain * Math.min(Math.max((row.chains || []).length - 1, 0), model.reach_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * reach));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category family, chains,
  // TVL and age decide the action, the capital, the hold and every cost and time.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c === 'chain') return 'chain';
    if (c.indexOf('launchpad') >= 0) return 'launchpad';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('farm') >= 0) return 'dex';
    if (c.indexOf('deriv') >= 0 || c.indexOf('option') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('prediction') >= 0) return 'derivatives';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('index') >= 0) return 'yield';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('stable') >= 0) return 'stable';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('nft') >= 0 || c.indexOf('marketplace') >= 0) return 'marketplace';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('btc') >= 0 || c.indexOf('anchor') >= 0) return 'btc';
    return 'other';
  }
  function primaryAction(p, capital, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lending': return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
      case 'dex': return "Provide $" + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
      case 'derivatives': return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
      case 'yield': return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
      case 'rwa': return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
      case 'stable': return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
      case 'bridge': return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
      case 'chain': return 'Bridge $' + capital + ' to ' + chain + " and use it in one of the chain's native apps.";
      case 'launchpad': return "Hold $" + capital + " of the launchpad's qualifying asset and register for the next sale on " + name + '.';
      case 'insurance': return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
      case 'marketplace': return 'List or buy one low-cost item through ' + name + ' on ' + chain + '.';
      case 'staking': return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
      case 'btc': return 'Deposit $' + capital + ' of BTC into ' + name + ' on ' + chain + ' and keep the receipt.';
      default: return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    }
  }
  function secondaryAction(p, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lending': return 'Borrow a small amount against the deposit on ' + name + ', then repay it, so both sides of the market are used.';
      case 'dex': return 'Swap a small amount through the pool each week so the router records trading volume.';
      case 'derivatives': return 'Close the hedge and open a second one the following week so the account shows repeat use.';
      case 'yield': return 'Deposit into a second vault or strategy on ' + name + ' so more than one product is used.';
      case 'rwa': return 'Reinvest the yield the asset pays into the same position instead of withdrawing it.';
      case 'stable': return 'Use the stable asset in a second app on ' + chain + ' so the mint is not a one-off.';
      case 'bridge': return 'Bridge a second, smaller amount back the other way a week later.';
      case 'chain': return 'Run a second transaction on ' + chain + ' a week later so the address stays active.';
      case 'launchpad': return "Complete the launchpad's registration steps on " + name + ' if it asks for any.';
      case 'insurance': return 'Renew or extend the cover before it lapses so the policy stays continuous.';
      case 'marketplace': return 'Place a second bid or listing the following week.';
      case 'staking': return 'Claim the staking rewards once, then restake them through ' + name + '.';
      case 'btc': return 'Move a second, smaller BTC deposit through ' + name + ' the following week.';
      default: return 'Use a second feature of the app, a swap, a vote or a second deposit, the following week.';
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Buy or bridge $10 of ' + chain + "'s gas token into that wallet before touching the protocol.", cost: 'about $2 to $5 of gas', time: '10 minutes' },
      { text: primaryAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondaryAction(p, chain), cost: 'about $2 to $4 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: "Open the protocol's own site and look for a points, quests or rewards page; if it lists tasks, complete the cheapest one.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind or repeat the position from the log.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'candidates') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function hay(r) {
    return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
  }
  function matches(r) {
    if (state.category !== 'all' && r.category !== state.category) return false;
    if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
    var q = state.q.trim().toLowerCase();
    return !q || hay(r).indexOf(q) >= 0;
  }
  function rows() { return DATA.rows.filter(matches); }
  function liveRows() { return DATA.live.filter(matches); }
  function asideRows() { return DATA.aside.filter(matches); }
  function sortList(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'mcap') { av = a.mcap_usd === null ? -Infinity : a.mcap_usd; bv = b.mcap_usd === null ? -Infinity : b.mcap_usd; }
      else { av = a.implied_value_usd || 0; bv = b.implied_value_usd || 0; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar ranks every launch candidate in the snapshot, ' + DATA.board_size + ' in all, and sets the rest aside with the reason. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'good', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Wrapped / staked set aside' }), el('b', { text: String(DATA.aside_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    function tab(name, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === name ? 'true' : 'false', text: label, onclick: function () { state.tab = name; state.selected = null; writeHash(); render(); } });
    }
    var countText = state.tab === 'candidates' ? rows().length + ' candidates shown'
      : state.tab === 'live' ? liveRows().length + ' live-token protocols' : asideRows().length + ' set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, tab('candidates', 'Launch candidates'), tab('live', 'Live token'), tab('aside', 'Set aside'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function emptyPanel() {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
    ));
  }

  function boardTable() {
    var list = sortList(rows());
    if (list.length === 0) return emptyPanel();
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' + (r.rank <= 3 ? ' rank-top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Launch candidates, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = sortList(liveRows());
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the launch ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), sortHeader('mcap', 'Market cap'), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function asideTable() {
    var list = sortList(asideRows());
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('span', { class: 'badge aside', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Set aside: pre-token on record, but a wrapped, staked or bridged product of a token that already trades, or a versioned pool. Not a launch of its own.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), sortHeader('tvl', 'TVL'), el('th', { scope: 'col', text: 'Why set aside' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var bands = [
      ['Chain, Launchpad', '0.35'], ['Lending, Derivatives', '0.30'], ['Dexs, Liquidity', '0.28'],
      ['Yield, Curators, Allocators', '0.22'], ['RWA', '0.18'], ['Insurance, NFT, BTC', '0.15'],
      ['Stablecoins', '0.12'], ['Bridge, Staking', '0.10'], ['Everything else', '0.20']
    ];
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x maturity(age_days) x (1 + ' + m.reach_per_chain + ' x min(chains - 1, ' + m.reach_max_chains + ')) )'
      ),
      el('p', { class: 'sub', text: 'Maturity rises from ' + m.maturity_floor + ' at listing to 1.00 at ' + m.maturity_peak_days + ' days, then eases by up to ' + m.maturity_ease + ' over the next ' + m.maturity_ease_days + ' days: a protocol that has run years with no token has had longer to prove no launch is coming. An unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category family' }), el('th', { scope: 'col', text: 'Multiple' }))),
        el('tbody', null, bands.map(function (b) { return el('tr', null, el('td', { text: b[0] }), el('td', { class: 'num', text: b[1] })); }))
      ),
      el('p', { class: 'sub', text: 'Set aside, never ranked: protocols whose token already trades (shown with their market cap), and pre-token protocols that are a wrapped, staked or bridged product of one that trades, an exchange product or a versioned pool.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: 'x ' + row.category_multiple.toFixed(2) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: 'x ' + row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: 'x ' + row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chain reach' }), el('b', { class: 'num', text: 'x ' + row.reach_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'sub', text: 'This protocol records no token in the snapshot; that is the record, not proof it has none. Never pay to claim, and never sign a link the protocol itself does not publish.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'candidates' ? boardTable() : state.tab === 'live' ? liveTable() : asideTable());
    if (state.tab === 'candidates') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'note', text: 'Implied value is this entry\u2019s own claim from the snapshot\u2019s figures, never a price and never a prediction that a token is issued. A protocol on this board records no token; it may still have one the record does not carry.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
