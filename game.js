'use strict';

// ============================================================
// CONFIGURATION
// ============================================================

const API_KEY = CONFIG.ANTHROPIC_API_KEY;
const API_URL     = 'https://api.anthropic.com/v1/messages';
const API_MODEL   = 'claude-sonnet-4-20250514';
const STORAGE_KEY  = 'treaty-or-betrayal-highscore';
const PRESTIGE_KEY = 'hegemon-prestige';
const GAMES_KEY    = 'hegemon-games';
const ACTION_COSTS = { trade: 1, sanctions: 1, alliance: 2, summit: 0 };

// Card color palette — assigned to player then each AI nation
const CARD_COLORS = ['#3a86ff', '#ff6b35', '#ff006e', '#06d6a0', '#8338ec', '#ffbe0b'];

// Role labels for trading cards
const PERSONALITY_ROLES = {
    'aggressive-expansionist': 'Aggressor',
    'economic-pragmatist':     'Diplomat',
    'isolationist-hardliner':  'Isolationist',
    'opportunistic-neutral':   'Opportunist',
};

// ============================================================
// GAME STATE
// ============================================================

const GameState = {
    round: 1,
    maxRounds: 5,
    // 'idle' | 'select-action' | 'select-intel' | 'resolving' | 'game-over'
    phase: 'idle',
    playerCountry: null,
    aiNations: [],
    stats:     { gdp: 50, military: 50, approval: 50 },
    relations: {},
    selectedAction: null,
    moveHistory: [],
    history:     [],
    log: [],
    usedEventIds: [],
    currentEvent: null,
    activeCascades: [],
    pendingRetaliations: [],
    objective: null,
    objectiveCompleted: false,
    objectiveTracking: { minGdp: 100 },
    intelTokens: 3,
    influenceTokens: 3,
    // New fields
    reputation: 50,
    summitUsed: false,
};

let pendingTargetNationId = null;
let typingInProgress      = false;
let currentRoundRecord    = null;

// Round timer state
let roundTimerInterval = null;
let roundTimerSeconds  = 45;
let roundTimerPaused   = false;

// ============================================================
// UTILITIES
// ============================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, lo, hi)  { return Math.max(lo, Math.min(hi, v)); }
function pickRandom(arr)   { return arr[Math.floor(Math.random() * arr.length)]; }

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function countryFlag(code) {
    return [...code.toUpperCase()]
        .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
        .join('');
}

function getRelationCategory(relation) {
    if (relation >= 20)  return 'allied';
    if (relation >= -20) return 'neutral';
    return 'hostile';
}

function getRelationLabel(relation) {
    return { allied: 'Allied', neutral: 'Neutral', hostile: 'Hostile' }[getRelationCategory(relation)];
}

function getRelationColor(relation) {
    if (relation >= 20)  return '#06d6a0';
    if (relation >= -20) return '#ffbe0b';
    return '#ff3860';
}

function getAIAutoTier(relation) {
    if (relation >= 60)  return 'allied';
    if (relation >= 20)  return 'friendly';
    if (relation >= -20) return 'neutral';
    if (relation >= -60) return 'cold';
    return 'hostile';
}

function colorForValue(v) {
    if (v >= 66) return '#06d6a0';
    if (v >= 40) return '#ffbe0b';
    return '#ff3860';
}

function fmtDelta(val) {
    if (!val || val === 0) return '±0';
    return (val > 0 ? '+' : '') + val;
}

function deltaSpan(val) {
    const s = fmtDelta(val);
    if (val > 0) return `<span class="deff-pos">${s}</span>`;
    if (val < 0) return `<span class="deff-neg">${s}</span>`;
    return `<span class="deff-zero">${s}</span>`;
}

function getMoodEmoji(relation) {
    if (relation >= 20)  return '😊';
    if (relation >= -20) return '😐';
    return '😤';
}

// ============================================================
// HIGH SCORE (localStorage)
// ============================================================

function getHighScore()   { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10); }
function saveHighScore(s) { localStorage.setItem(STORAGE_KEY, String(s)); }

function checkAndSaveHighScore(score) {
    const prev = getHighScore();
    const isNew = score > prev;
    if (isNew) saveHighScore(score);
    return { isNew, prev };
}

// ============================================================
// TYPING ANIMATION
// ============================================================

async function typeText(el, text, speed = 14) {
    el.textContent = '';
    typingInProgress = true;
    for (const ch of text) {
        if (!typingInProgress) { el.textContent = text; break; }
        el.textContent += ch;
        await sleep(speed);
    }
    typingInProgress = false;
}

// ============================================================
// REPUTATION SYSTEM
// ============================================================

function adjustReputation(delta) {
    GameState.reputation = clamp(GameState.reputation + delta, 0, 100);
    updateReputationBar();
    checkSummitUnlock();
}

function updateReputationBar() {
    const fill  = document.getElementById('reputation-bar-fill');
    const label = document.getElementById('reputation-label');
    if (!fill) return;

    fill.style.width = GameState.reputation + '%';

    let color;
    if (GameState.reputation < 30)      color = '#ff3860';
    else if (GameState.reputation < 60) color = '#ffbe0b';
    else                                color = '#06d6a0';
    fill.style.background = color;

    if (label) label.textContent = GameState.reputation;
}

function checkSummitUnlock() {
    const summitCard = document.getElementById('action-summit');
    if (!summitCard) return;
    if (GameState.reputation > 70 && !GameState.summitUsed) {
        summitCard.classList.remove('hidden');
    } else if (GameState.summitUsed) {
        summitCard.classList.add('hidden');
    }
    repositionHandCards();
}

// ============================================================
// ROUND TIMER
// ============================================================

function startRoundTimer() {
    clearRoundTimer();
    roundTimerSeconds = 45;
    roundTimerPaused  = false;
    updateTimerBar();

    roundTimerInterval = setInterval(() => {
        if (roundTimerPaused) return;
        if (GameState.phase !== 'select-action') { clearRoundTimer(); return; }
        roundTimerSeconds = Math.max(0, roundTimerSeconds - 1);
        updateTimerBar();
        if (roundTimerSeconds <= 0) {
            clearRoundTimer();
            triggerPanic();
        }
    }, 1000);
}

function clearRoundTimer() {
    if (roundTimerInterval) {
        clearInterval(roundTimerInterval);
        roundTimerInterval = null;
    }
    const bar = document.getElementById('round-timer-bar');
    if (bar) { bar.style.width = '0%'; bar.style.background = '#ff3860'; }
}

function updateTimerBar() {
    const bar = document.getElementById('round-timer-bar');
    if (!bar) return;
    const pct = (roundTimerSeconds / 45) * 100;
    bar.style.width = pct + '%';
    if (roundTimerSeconds > 20)      bar.style.background = '#06d6a0';
    else if (roundTimerSeconds > 10) bar.style.background = '#ffbe0b';
    else                              bar.style.background = '#ff3860';
}

function triggerPanic() {
    if (GameState.phase !== 'select-action') return;
    const randomAction = pickRandom(['trade', 'sanctions', 'alliance']);
    const randomNation = pickRandom(GameState.aiNations);

    applyDeltas(0, 0, -5);
    updateLastAction(`⚠ PANIC — auto-dispatched ${randomAction.toUpperCase()} to ${randomNation.name}. APR −5.`);
    addLog('system', `[PANIC] No action taken — auto-resolving: ${randomAction} → ${randomNation.name}. Approval −5.`);

    GameState.selectedAction = randomAction;
    GameState.phase = 'resolving';
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`action-${randomAction}`)?.classList.add('selected');
    renderPhase();

    setTimeout(() => resolvePlayerAction(randomNation, randomAction), 350);
}

// ============================================================
// LAST ACTION LINE
// ============================================================

function updateLastAction(text) {
    const el = document.getElementById('last-action-bar');
    if (el) el.textContent = text;
}

// ============================================================
// INITIALIZATION
// ============================================================

function initGame() {
    GameState.round               = 1;
    GameState.phase               = 'idle';
    GameState.selectedAction      = null;
    GameState.log                 = [];
    GameState.moveHistory         = [];
    GameState.history             = [];
    GameState.usedEventIds        = [];
    GameState.currentEvent        = null;
    GameState.activeCascades      = [];
    GameState.pendingRetaliations = [];
    GameState.objective           = null;
    GameState.objectiveCompleted  = false;
    GameState.objectiveTracking   = { minGdp: 100 };
    GameState.intelTokens         = 3;
    GameState.influenceTokens     = 3;
    GameState.reputation          = 50;
    GameState.summitUsed          = false;
    pendingTargetNationId         = null;
    typingInProgress              = false;
    currentRoundRecord            = null;

    clearRoundTimer();

    const pool = shuffle(NATIONS);
    GameState.playerCountry = pool[0];

    const personalityPool = shuffle(Object.keys(PERSONALITIES));
    GameState.aiNations   = pool.slice(1, 4).map((nation, i) => ({
        ...nation,
        personality:  personalityPool[i],
        hiddenAgenda: pickRandom(PERSONALITIES[personalityPool[i]].hiddenAgendas),
    }));

    GameState.relations = {};
    GameState.aiNations.forEach(n => { GameState.relations[n.id] = randInt(-10, 10); });

    GameState.stats = {
        gdp:      Math.min(GameState.playerCountry.gdp,      100),
        military: Math.min(GameState.playerCountry.military, 100),
        approval: Math.min(GameState.playerCountry.approval, 100),
    };

    GameState.objective = pickRandom(OBJECTIVES);

    clearLog();
    renderBriefingScreen();
}

// ============================================================
// SCREEN MANAGEMENT
// ============================================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (id !== 'screen-game') {
        document.getElementById(id)?.classList.add('active');
    }
}

// ============================================================
// BRIEFING / ASSIGNMENT SCREEN — Trading Cards
// ============================================================

async function renderBriefingScreen() {
    const c     = GameState.playerCountry;
    const color = CARD_COLORS[0];

    // Player card
    document.getElementById('briefing-flag').textContent         = countryFlag(c.code);
    document.getElementById('briefing-nation-name').textContent  = c.name;
    document.getElementById('briefing-nation-region').textContent = c.region;
    document.getElementById('briefing-gdp').textContent          = GameState.stats.gdp;
    document.getElementById('briefing-mil').textContent          = GameState.stats.military;
    document.getElementById('briefing-apr').textContent          = GameState.stats.approval;

    // Style player card top section
    const tcTop = document.getElementById('tc-top-player');
    if (tcTop) tcTop.style.background = color;

    // Style player stat bars
    const fills = { gdp: 'tc-gdp-fill', mil: 'tc-mil-fill', apr: 'tc-apr-fill' };
    const vals  = { gdp: GameState.stats.gdp, mil: GameState.stats.military, apr: GameState.stats.approval };
    Object.entries(fills).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (el) { el.style.width = vals[k] + '%'; el.style.background = color; }
    });

    // Role pill
    const rolePill = document.getElementById('player-role-pill');
    if (rolePill) {
        rolePill.style.color       = color;
        rolePill.style.background  = color + '18';
        rolePill.style.borderColor = color + '44';
    }

    // AI adversary trading cards
    const grid = document.getElementById('briefing-adversaries-grid');
    grid.innerHTML = '';
    GameState.aiNations.forEach((nation, i) => {
        const aiColor = CARD_COLORS[(i + 1) % CARD_COLORS.length];
        const role    = PERSONALITY_ROLES[nation.personality] || 'Leader';

        const card = document.createElement('div');
        card.className = 'trading-card ai-trading-card';

        card.innerHTML = `
            <div class="tc-top" style="background:${aiColor}">
                <span class="tc-flag" style="font-size:44px">${countryFlag(nation.code)}</span>
            </div>
            <div class="tc-bottom">
                <div class="tc-name">${nation.name}</div>
                <div class="tc-role-pill" style="color:${aiColor};background:${aiColor}18;border-color:${aiColor}44">${role.toUpperCase()}</div>
                <div class="tc-stats">
                    <div class="tc-stat-row">
                        <span class="tc-stat-label">GDP</span>
                        <div class="tc-stat-track"><div class="tc-stat-fill" style="width:${nation.gdp}%;background:${aiColor}"></div></div>
                        <span class="tc-stat-num">${nation.gdp}</span>
                    </div>
                    <div class="tc-stat-row">
                        <span class="tc-stat-label">MIL</span>
                        <div class="tc-stat-track"><div class="tc-stat-fill" style="width:${nation.military}%;background:${aiColor}"></div></div>
                        <span class="tc-stat-num">${nation.military}</span>
                    </div>
                    <div class="tc-stat-row">
                        <span class="tc-stat-label">APR</span>
                        <div class="tc-stat-track"><div class="tc-stat-fill" style="width:${nation.approval}%;background:${aiColor}"></div></div>
                        <span class="tc-stat-num">${nation.approval}</span>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Run API briefing in background (hidden elements for compat)
    const loadingEl = document.getElementById('briefing-loading');
    const textEl    = document.getElementById('briefing-text');
    const cursorEl  = document.getElementById('briefing-cursor');
    const btnBegin  = document.getElementById('btn-begin-mission');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (textEl)    textEl.textContent = '';
    if (cursorEl)  cursorEl.classList.add('hidden');
    btnBegin.disabled = true;

    showScreen('screen-briefing');

    try {
        await callAnthropicForBriefing({
            playerCountry: GameState.playerCountry,
            aiNations:     GameState.aiNations,
            stats:         { ...GameState.stats },
        });
    } catch (err) {
        console.error('[Briefing API]', err);
    }

    if (loadingEl) loadingEl.classList.add('hidden');
    btnBegin.disabled = false;
}

function startMission() {
    currentRoundRecord = { round: 1, eventHeadline: null, playerAction: null, autoActions: [] };
    GameState.phase = 'select-action';

    clearLog();
    addLog('system', `HEGEMON — Representing ${GameState.playerCountry.name}. Five rounds of diplomacy await.`);
    addLog('system', `――― ROUND 1 BEGINS ―――`);

    clearEventTicker();
    renderGame();
    showScreen('screen-game');

    renderObjectiveCard();
    document.getElementById('objective-card')?.classList.remove('hidden');
    document.getElementById('intel-section')?.classList.remove('hidden');

    updateReputationBar();
    renderInfluenceGems();
    repositionHandCards();
    checkPrestigeDisplay();
    updateLastAction('Select an action card, then click a nation to act.');
    startRoundTimer();
}

// ============================================================
// RENDERING
// ============================================================

function renderGame() {
    renderPlayerPanel();
    renderAINations();
    renderRound();
    renderPhase();
}

function renderPlayerPanel() {
    const c = GameState.playerCountry;
    if (!c) return;
    document.getElementById('player-flag').textContent          = countryFlag(c.code);
    document.getElementById('player-country-name').textContent  = c.name;
    document.getElementById('player-country-region').textContent = c.region;
    updateStats();
}

function updateStats() {
    const { gdp, military, approval } = GameState.stats;
    document.getElementById('stat-gdp').textContent      = gdp;
    document.getElementById('stat-military').textContent  = military;
    document.getElementById('stat-approval').textContent  = approval;
    setBar('bar-gdp',      gdp);
    setBar('bar-military', military);
    setBar('bar-approval', approval);
}

function setBar(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width      = clamp(value, 0, 100) + '%';
    el.style.background = colorForValue(value);
}

function renderPips(value, maxPips) {
    const filled = Math.min(Math.round(value / 100 * maxPips), maxPips);
    let html = '';
    for (let i = 0; i < maxPips; i++) {
        html += `<span class="nc-pip ${i < filled ? 'nc-pip-filled' : 'nc-pip-empty'}"></span>`;
    }
    return html;
}

function renderAINations() {
    const grid = document.getElementById('nations-grid');
    if (!grid) return;
    grid.innerHTML = '';

    GameState.aiNations.forEach((nation, idx) => {
        const rel   = GameState.relations[nation.id] ?? 0;
        const cat   = getRelationCategory(rel);
        const mood  = getMoodEmoji(rel);
        const color = CARD_COLORS[(idx + 1) % CARD_COLORS.length];

        const card = document.createElement('div');
        card.className = `nation-card`;
        card.id = `nation-card-${idx}`;
        card.dataset.nationIndex = idx;

        card.innerHTML = `
            <div class="nc-top" style="background:${color}">
                <span class="nation-flag">${countryFlag(nation.code)}</span>
                <span class="nc-mood">${mood}</span>
            </div>
            <div class="nc-bottom">
                <div class="nation-name">${nation.name}</div>
                <div class="nc-pips-row">
                    <span class="nc-pip-label">G</span>${renderPips(nation.gdp, 5)}
                </div>
                <div class="nc-pips-row">
                    <span class="nc-pip-label">M</span>${renderPips(nation.military, 5)}
                </div>
                <div class="nc-pips-row">
                    <span class="nc-pip-label">A</span>${renderPips(nation.approval, 5)}
                </div>
                <div class="nc-rel-row">
                    <span class="rel-dot rel-dot-${cat}"></span>
                    <span class="nation-rel-num">${rel > 0 ? '+' : ''}${rel}</span>
                </div>
            </div>
            <div class="nation-overlay"><span class="overlay-text">▶ DROP HERE</span></div>
            <div class="nation-info" style="display:none">
                <div class="nation-region">${nation.region}</div>
                <span class="nation-personality-tag personality-${nation.personality}"></span>
            </div>
            <div class="nation-aside" style="display:none"></div>
        `;

        card.addEventListener('click', () => handleNationSelect(idx));
        grid.appendChild(card);
    });
}

function renderRound() {
    document.getElementById('round-number').textContent = GameState.round;
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`pip-${i}`)?.classList.toggle('pip-filled', i <= GameState.round);
    }
}

function renderPhase() {
    const indicator = document.getElementById('phase-indicator');
    const grid      = document.getElementById('actions-grid');

    switch (GameState.phase) {
        case 'select-action':
            indicator.textContent = GameState.selectedAction ? 'SELECT TARGET' : 'YOUR TURN';
            grid.classList.remove('disabled');
            document.querySelectorAll('.nation-card').forEach(c => {
                c.classList.toggle('targetable', !!GameState.selectedAction);
            });
            break;
        case 'select-intel':
            indicator.textContent = 'INTEL TARGET';
            grid.classList.add('disabled');
            document.querySelectorAll('.nation-card').forEach(c => c.classList.add('targetable'));
            break;
        case 'resolving':
            indicator.textContent = 'RESOLVING...';
            grid.classList.add('disabled');
            document.querySelectorAll('.nation-card').forEach(c => c.classList.remove('targetable'));
            break;
        case 'game-over':
            indicator.textContent = 'TERM CONCLUDED';
            grid.classList.add('disabled');
            document.querySelectorAll('.nation-card').forEach(c => c.classList.remove('targetable'));
            break;
    }

    updateBtnRunIntel();

    // Show/hide target prompt
    const prompt = document.getElementById('target-prompt');
    if (prompt) {
        prompt.classList.toggle('hidden', GameState.phase !== 'select-action' || !GameState.selectedAction);
    }
}

// ============================================================
// SECRET OBJECTIVES
// ============================================================

function renderObjectiveCard() {
    const obj = GameState.objective;
    if (!obj) return;

    const nameEl  = document.getElementById('objective-name');
    const bonusEl = document.getElementById('objective-bonus');
    const iconEl  = document.getElementById('objective-status-icon');
    const cardEl  = document.getElementById('objective-card');

    if (nameEl)  nameEl.textContent  = obj.name;
    if (bonusEl) bonusEl.textContent = `+${obj.bonusScore} pts`;

    if (iconEl) {
        iconEl.textContent = GameState.objectiveCompleted ? '✓' : '🔒';
        iconEl.style.color = GameState.objectiveCompleted ? '#06d6a0' : '';
    }

    if (cardEl) cardEl.classList.remove('hidden');
}

function pulseObjectiveCard() {
    const cardEl = document.getElementById('objective-card');
    if (!cardEl) return;
    cardEl.classList.add('pulse-check');
    setTimeout(() => cardEl.classList.remove('pulse-check'), 1400);
}

function evaluateObjective() {
    if (!GameState.objective || GameState.objectiveCompleted) return false;
    const result = GameState.objective.evaluate(GameState);
    if (result) {
        GameState.objectiveCompleted = true;
        pulseObjectiveCard();
        renderObjectiveCard();
        addLog('system', `[OBJECTIVE COMPLETE] ${GameState.objective.name} — +${GameState.objective.bonusScore} pts`);
    }
    return result;
}

// ============================================================
// INTEL TOKENS (kept for compat, UI hidden)
// ============================================================

function renderIntelTokens() {
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`intel-token-${i}`);
        if (!el) continue;
        el.className = i < GameState.intelTokens ? 'intel-token available' : 'intel-token spent';
    }
}

function updateBtnRunIntel() {
    const btn = document.getElementById('btn-run-intel');
    if (!btn) return;
    btn.disabled = !(GameState.intelTokens > 0 && GameState.phase === 'select-action');
}

async function runIntel(nation) {
    GameState.intelTokens = Math.max(0, GameState.intelTokens - 1);
    renderIntelTokens();
    GameState.phase = 'select-action';
    renderPhase();

    const revealTypes = ['response_preview', 'hidden_agenda', 'alliance_intel'];
    const revealType  = pickRandom(revealTypes);

    try {
        const resultText = await callAnthropicForIntel({
            targetNation:  nation,
            playerCountry: GameState.playerCountry,
            relations:     { ...GameState.relations },
            stats:         { ...GameState.stats },
            revealType,
        });
        showIntelPopup(nation, resultText);
    } catch (err) {
        console.error('[Intel API]', err);
        showIntelPopup(nation, '— Signal lost. Intelligence intercept failed. Channel compromised. —');
    }
}

async function callAnthropicForIntel(context) {
    const { targetNation, playerCountry, revealType } = context;

    let userMsg = '';
    switch (revealType) {
        case 'response_preview':
            userMsg = `Intel intercept: How would you react to these 3 possible actions by ${playerCountry.name} this round? Answer ONLY with one line: Trade: [👍/😐/👎] | Sanctions: [👍/😐/👎] | Alliance: [👍/😐/👎]`;
            break;
        case 'hidden_agenda':
            userMsg = `Intel intercept: State your current strategic priority in ONE sentence only. Be specific.`;
            break;
        case 'alliance_intel':
            userMsg = `Intel intercept: Describe your current diplomatic positioning toward the other nations in this theater in ONE sentence.`;
            break;
        default:
            userMsg = `Intel intercept: State your current strategic priority in ONE sentence only. Be specific.`;
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type':                              'application/json',
                'x-api-key':                                 API_KEY,
                'anthropic-version':                         '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model:      API_MODEL,
                max_tokens: 100,
                system:     `You are the foreign minister of ${targetNation.name}. You are responding to an intelligence intercept. Be brief and in-character.`,
                messages:   [{ role: 'user', content: userMsg }],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`Intel API ${res.status}`);
        const data = await res.json();
        return (data.content?.[0]?.text ?? '').trim();
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

function showIntelPopup(nation, text) {
    const popup    = document.getElementById('intel-popup');
    const nationEl = document.getElementById('intel-popup-nation');
    const textEl   = document.getElementById('intel-popup-text');

    if (!popup) { addLog('system', `[INTEL: ${nation.name}] ${text}`); return; }
    if (nationEl) nationEl.textContent = `${countryFlag(nation.code)} ${nation.name}`;
    if (textEl)   textEl.textContent   = text;

    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 8000);
}

// ============================================================
// ACTION SELECTION — One-click flow
// ============================================================

function handleActionSelect(actionId) {
    if (GameState.phase !== 'select-action') return;

    // Toggle deselect
    if (GameState.selectedAction === actionId) {
        GameState.selectedAction = null;
        document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
        renderPhase();
        return;
    }

    GameState.selectedAction = actionId;
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`action-${actionId}`)?.classList.add('selected');
    renderPhase();
}

function handleNationSelect(idx) {
    const nation = GameState.aiNations[idx];
    if (!nation) return;

    // Intel mode
    if (GameState.phase === 'select-intel') {
        const card = document.getElementById(`nation-card-${idx}`);
        card?.classList.add('targeted');
        setTimeout(() => card?.classList.remove('targeted'), 600);
        addLog('player', `[INTEL] Running intelligence operation on ${nation.name}...`);
        runIntel(nation);
        return;
    }

    // One-click action: need action selected and be in select-action phase
    if (GameState.phase === 'select-action' && GameState.selectedAction) {
        clearRoundTimer();
        const card = document.getElementById(`nation-card-${idx}`);
        card?.classList.add('targeted');
        setTimeout(() => card?.classList.remove('targeted'), 600);

        GameState.phase = 'resolving';
        renderPhase();
        setTimeout(() => resolvePlayerAction(nation, GameState.selectedAction), 350);
    }
}

// ============================================================
// CASCADING WORLD EVENTS
// ============================================================

function drawWorldEvent() {
    const available = WORLD_EVENTS.filter(e => !GameState.usedEventIds.includes(e.id));
    if (!available.length) return null;
    const event = pickRandom(available);
    GameState.usedEventIds.push(event.id);
    return event;
}

function applyWorldEvent(event) {
    const { gdp, military, approval, allRelations } = event.immediateEffect;
    applyDeltas(gdp, military, approval);

    ['gdp', 'military', 'approval'].forEach(k => {
        GameState.stats[k] = clamp(GameState.stats[k], 0, 100);
    });

    if (allRelations) {
        GameState.aiNations.forEach(n => {
            GameState.relations[n.id] = clamp(GameState.relations[n.id] + allRelations, -100, 100);
        });
    }

    if (event.cascadeRule != null) {
        const cr = event.cascadeRule;
        GameState.activeCascades.push({
            id:                    event.id,
            description:           cr.description,
            longDesc:              cr.longDesc,
            type:                  cr.type,
            value:                 cr.value,
            roundsRemaining:       cr.roundsRemaining,
            approvalCostMultiplier: cr.approvalCostMultiplier || 1,
        });
    }

    renderCascadePills();
    updateStats();
    renderAINations();
}

function showWorldEventBanner(event, callback) {
    // Update hidden compat elements
    const nameEl    = document.getElementById('web-event-name');
    const flavorEl  = document.getElementById('web-flavor-text');
    const cascadeEl = document.getElementById('web-cascade-rule');
    if (nameEl)    nameEl.textContent    = event.name;
    if (flavorEl)  flavorEl.textContent  = event.flavorText;
    if (cascadeEl) cascadeEl.textContent = event.cascadeRule ? event.cascadeRule.longDesc : 'No lasting effect.';

    updateEventTicker(event);

    // Event card flip on the felt table
    const eventArea = document.getElementById('event-card-area');
    const flipCard  = document.getElementById('event-flip-card');
    const nameBack  = document.getElementById('efc-event-name');
    const descBack  = document.getElementById('efc-event-desc');

    if (eventArea && flipCard) {
        if (nameBack) nameBack.textContent = event.name;
        if (descBack) descBack.textContent = event.flavorText;
        flipCard.classList.remove('flipped');
        eventArea.classList.add('visible');

        setTimeout(() => {
            flipCard.classList.add('flipped');
            setTimeout(() => {
                eventArea.classList.remove('visible');
                flipCard.classList.remove('flipped');
                const discardCount = document.getElementById('discard-count');
                if (discardCount) discardCount.textContent = GameState.usedEventIds.length;
                if (typeof callback === 'function') callback();
            }, 3200);
        }, 500);
    } else {
        setTimeout(() => { if (typeof callback === 'function') callback(); }, 1200);
    }
}

function renderCascadePills() {
    const container = document.getElementById('cascade-pills');
    const strip     = document.getElementById('cascade-strip');
    if (!container) return;

    container.innerHTML = '';
    GameState.activeCascades.forEach(cascade => {
        const pill = document.createElement('div');
        pill.className   = 'cascade-pill';
        pill.textContent = cascade.description;
        container.appendChild(pill);
    });

    if (strip) {
        strip.classList.toggle('hidden', GameState.activeCascades.length === 0);
    }

    // Keep event pill updated with most recent cascade
    if (GameState.activeCascades.length > 0) {
        const tickerText = document.getElementById('event-ticker-text');
        if (tickerText && GameState.currentEvent) {
            tickerText.textContent = GameState.activeCascades.map(c => c.description).join(' · ');
        }
    }
}

function applyCascadeModifiers(actionId, aiResult) {
    let result = {
        ...aiResult,
        stat_effects: { ...aiResult.stat_effects },
    };

    for (const cascade of GameState.activeCascades) {
        switch (cascade.type) {
            case 'trade_gdp_multiplier':
                if (actionId === 'trade') {
                    result.stat_effects.gdp = clamp(Math.round(result.stat_effects.gdp * cascade.value), -10, 10);
                }
                break;
            case 'military_multiplier':
                if (actionId === 'sanctions') {
                    result.stat_effects.military = clamp(Math.round(result.stat_effects.military * cascade.value), -10, 10);
                    if (cascade.approvalCostMultiplier > 1 && result.stat_effects.approval < 0) {
                        result.stat_effects.approval = clamp(Math.round(result.stat_effects.approval * cascade.approvalCostMultiplier), -10, 10);
                    }
                }
                break;
            case 'alliance_rel_multiplier':
                if (actionId === 'alliance') {
                    result.relationship_change = clamp(Math.round(result.relationship_change * cascade.value), -20, 20);
                }
                break;
            case 'sanctions_rel_multiplier':
                if (actionId === 'sanctions') {
                    result.relationship_change = clamp(Math.round(result.relationship_change * cascade.value), -20, 20);
                }
                break;
            case 'global_multiplier':
                result.stat_effects.gdp      = clamp(Math.round(result.stat_effects.gdp      * cascade.value), -10, 10);
                result.stat_effects.military = clamp(Math.round(result.stat_effects.military  * cascade.value), -10, 10);
                result.stat_effects.approval = clamp(Math.round(result.stat_effects.approval  * cascade.value), -10, 10);
                break;
        }
    }

    return result;
}

function tickCascades() {
    GameState.activeCascades.forEach(c => { if (c.roundsRemaining > 0) c.roundsRemaining--; });
    GameState.activeCascades = GameState.activeCascades.filter(c => c.roundsRemaining > 0);
    renderCascadePills();

    // Clear event pill if no more cascades and no current event
    if (GameState.activeCascades.length === 0) clearEventTicker();
}

function getPendingRetaliation() {
    return GameState.activeCascades.find(c => c.type === 'sanctions_retaliation') || null;
}

// ============================================================
// SUMMIT ACTION
// ============================================================

async function resolveSummitAction() {
    GameState.summitUsed = true;
    document.getElementById('action-summit')?.classList.add('hidden');
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));

    // Apply relationship gains to all nations
    GameState.aiNations.forEach(n => {
        GameState.relations[n.id] = clamp(GameState.relations[n.id] + 25, -100, 100);
    });
    applyDeltas(0, 0, 5);
    adjustReputation(10);

    GameState.moveHistory.push({
        round:             GameState.round,
        actionId:          'summit',
        actionLabel:       'GLOBAL SUMMIT',
        targetName:        'All Nations',
        targetPersonality: 'opportunistic-neutral',
        relationChange:    25,
    });

    if (currentRoundRecord) {
        currentRoundRecord.playerAction = {
            actionLabel:       'GLOBAL SUMMIT',
            targetName:        'All Nations',
            targetPersonality: 'opportunistic-neutral',
            responseText:      'The international summit convenes with historic momentum. All attending nations signal willingness for unprecedented cooperation.',
            relationChange:    25,
            statEffects:       { gdp: 0, military: 0, approval: 5 },
        };
    }

    addLog('system', `[SUMMIT] Global summit held — All Relations +25 | APR +5 | REP +10.`);
    updateLastAction(`Round ${GameState.round}: SUMMIT — all nations +25 relations.`);

    ['gdp', 'military', 'approval'].forEach(k => {
        GameState.stats[k] = clamp(GameState.stats[k], 0, 100);
    });
    updateStats();
    renderAINations();
    evaluateObjective();

    // Show a brief dispatch-style confirmation, then proceed
    openDispatchLoading({ name: 'All Nations', code: 'UN', region: 'Global', personality: 'opportunistic-neutral' }, 'summit');
    await sleep(600);
    document.getElementById('dispatch-loading')?.classList.add('hidden');

    const fakeResult = {
        response_text:       'The international summit convenes with historic momentum. All attending nations signal willingness for unprecedented multilateral cooperation.',
        relationship_change: 25,
        stat_effects:        { gdp: 0, military: 0, approval: 5 },
    };
    await openDispatchResponse(fakeResult);
}

// ============================================================
// ROUND RESOLUTION
// ============================================================

async function resolvePlayerAction(targetNation, actionId) {
    // Summit is handled separately
    if (actionId === 'summit') {
        pendingTargetNationId = GameState.aiNations[0]?.id || null;
        GameState.phase = 'resolving';
        await resolveSummitAction();
        return;
    }

    pendingTargetNationId = targetNation.id;

    // Deduct influence tokens
    const tokenCost = ACTION_COSTS[actionId] || 0;
    if (tokenCost > 0) {
        GameState.influenceTokens = Math.max(0, GameState.influenceTokens - tokenCost);
        renderInfluenceGems();
    }

    const action = ACTIONS[actionId];

    applyDeltas(action.baseCosts.gdp, action.baseCosts.military, action.baseCosts.approval);
    addLog('action', `[ROUND ${GameState.round}] ${action.label} → ${targetNation.name}.`);

    openDispatchLoading(targetNation, actionId);

    let aiResult;
    try {
        aiResult = await callAnthropicAPI({
            playerCountry: GameState.playerCountry,
            targetNation,
            actionId,
            round:     GameState.round,
            relations: { ...GameState.relations },
            stats:     { ...GameState.stats },
        });
    } catch (err) {
        console.error('[Anthropic API]', err);
        addLog('system', '[COMM ERROR] Channel disrupted. Falling back to intelligence estimate.');
        const fb = RESPONSE_MATRIX[actionId][targetNation.personality];
        aiResult = {
            response_text:       `${targetNation.name} ${fb.message}.`,
            relationship_change: fb.relation,
            stat_effects: { gdp: fb.gdp, military: fb.military, approval: fb.approval },
        };
    }

    const finalResult = applyCascadeModifiers(actionId, aiResult);

    applyDeltas(finalResult.stat_effects.gdp, finalResult.stat_effects.military, finalResult.stat_effects.approval);

    const prevRel = GameState.relations[targetNation.id];
    GameState.relations[targetNation.id] = clamp(prevRel + finalResult.relationship_change, -100, 100);

    GameState.moveHistory.push({
        round:             GameState.round,
        actionId:          actionId,
        actionLabel:       action.label,
        targetName:        targetNation.name,
        targetPersonality: targetNation.personality,
        relationChange:    finalResult.relationship_change,
    });

    if (currentRoundRecord) {
        currentRoundRecord.playerAction = {
            actionLabel:       action.label,
            targetName:        targetNation.name,
            targetPersonality: targetNation.personality,
            responseText:      finalResult.response_text,
            relationChange:    finalResult.relationship_change,
            statEffects:       { ...finalResult.stat_effects },
        };
    }

    addLog('response', finalResult.response_text);
    addLog('delta',
        `EFFECT → GDP ${fmtDelta(finalResult.stat_effects.gdp)} | ` +
        `MIL ${fmtDelta(finalResult.stat_effects.military)} | ` +
        `APR ${fmtDelta(finalResult.stat_effects.approval)} | ` +
        `REL[${targetNation.name.split(' ')[0]}] ${fmtDelta(finalResult.relationship_change)}`
    );

    ['gdp', 'military', 'approval'].forEach(k => {
        GameState.stats[k] = clamp(GameState.stats[k], 0, 100);
    });
    updateStats();
    renderAINations();

    // Visual effects on nation card
    const tgtIdx = GameState.aiNations.findIndex(n => n.id === targetNation.id);
    const tgtCard = document.getElementById(`nation-card-${tgtIdx}`);
    if (tgtCard) {
        const r   = tgtCard.getBoundingClientRect();
        const cx  = r.left + r.width  / 2;
        const cy  = r.top  + r.height / 2;
        if (actionId === 'sanctions') {
            tgtCard.classList.add('sanctioned');
            spawnParticles(cx, cy, '#e63946', 10);
            setTimeout(() => tgtCard.classList.remove('sanctioned'), 500);
        } else if (actionId === 'alliance' && finalResult.relationship_change > 0) {
            tgtCard.classList.add('alliance-glow');
            spawnParticles(cx, cy, '#f0c040', 14);
            setTimeout(() => tgtCard.classList.remove('alliance-glow'), 4500);
        }
    }

    GameState.objectiveTracking.minGdp = Math.min(GameState.objectiveTracking.minGdp, GameState.stats.gdp);
    evaluateObjective();

    // Adjust reputation based on action
    const repDeltas = { trade: 5, sanctions: -5, alliance: 3 };
    adjustReputation(repDeltas[actionId] || 0);

    // Update last action line
    updateLastAction(
        `Round ${GameState.round}: ${action.label} → ${targetNation.name} [REL ${fmtDelta(finalResult.relationship_change)} | GDP ${fmtDelta(finalResult.stat_effects.gdp)} | APR ${fmtDelta(finalResult.stat_effects.approval)}]`
    );

    await openDispatchResponse(finalResult);
}

function resolveAIAutoActions(excludeId) {
    GameState.aiNations
        .filter(n => n.id !== excludeId)
        .forEach(nation => {
            const tier       = getAIAutoTier(GameState.relations[nation.id]);
            const autoAction = AI_AUTO_ACTIONS[nation.personality][tier];

            // Extra retaliation when reputation is critically low
            let gdpMod = 0, aprMod = 0;
            if (GameState.reputation < 30) {
                gdpMod = -2;
                aprMod = -1;
            }

            const totalGdp = (autoAction.gdp || 0) + gdpMod;
            const totalMil = (autoAction.military || 0);
            const totalApr = (autoAction.approval || 0) + aprMod;

            if (totalGdp || totalMil || totalApr) {
                applyDeltas(totalGdp, totalMil, totalApr);
                addLog('ai',    `${nation.name} ${autoAction.message}.`);
                addLog('delta', `EFFECT → GDP ${fmtDelta(totalGdp)} | MIL ${fmtDelta(totalMil)} | APR ${fmtDelta(totalApr)}`);

                if (currentRoundRecord) {
                    currentRoundRecord.autoActions.push({
                        nationName: nation.name,
                        message:    autoAction.message,
                        gdp:        totalGdp,
                        military:   totalMil,
                        approval:   totalApr,
                    });
                }
            }
        });

    ['gdp', 'military', 'approval'].forEach(k => {
        GameState.stats[k] = clamp(GameState.stats[k], 0, 100);
    });
    updateStats();
    renderAINations();
    advanceRound();
}

function applyDeltas(gdp, mil, apr) {
    GameState.stats.gdp      = Math.round(GameState.stats.gdp      + (gdp || 0));
    GameState.stats.military  = Math.round(GameState.stats.military  + (mil || 0));
    GameState.stats.approval  = Math.round(GameState.stats.approval  + (apr || 0));
}

// ============================================================
// DISPATCH PANEL
// ============================================================

function openDispatchLoading(nation, actionId) {
    const p = PERSONALITIES[nation.personality] || { label: 'UNKNOWN' };

    document.getElementById('dispatch-flag').textContent          = (nation.code === 'UN') ? '🌐' : countryFlag(nation.code || 'US');
    document.getElementById('dispatch-nation-name').textContent   = nation.name;
    document.getElementById('dispatch-nation-region').textContent = nation.region || '';
    document.getElementById('dispatch-action-label').textContent  = `IN RESPONSE TO: ${(ACTIONS[actionId] || { label: actionId.toUpperCase() }).label}`;

    const tag = document.getElementById('dispatch-personality-tag');
    tag.textContent = p.label;
    tag.className   = `dispatch-personality-tag personality-${nation.personality || ''}`;

    document.getElementById('dispatch-loading').classList.remove('hidden');
    document.getElementById('dispatch-response-section').classList.add('hidden');
    document.getElementById('dispatch-effects-section').classList.add('hidden');

    const ack = document.getElementById('dispatch-acknowledge');
    ack.disabled    = true;
    ack.textContent = 'RECEIVING...';

    const cursor = document.getElementById('tele-cursor');
    if (cursor) cursor.classList.add('hidden');

    document.getElementById('response-idle')?.classList.add('hidden');
    document.getElementById('dispatch-overlay').classList.add('active');
}

async function openDispatchResponse(aiResult) {
    document.getElementById('dispatch-loading').classList.add('hidden');

    const responseSection = document.getElementById('dispatch-response-section');
    responseSection.classList.remove('hidden');

    const textEl   = document.getElementById('dispatch-text');
    const cursorEl = document.getElementById('tele-cursor');

    textEl.textContent = '';
    cursorEl?.classList.remove('hidden');
    await typeText(textEl, aiResult.response_text, 13);
    cursorEl?.classList.add('hidden');

    const { relationship_change: rel, stat_effects: { gdp, military, approval } } = aiResult;
    document.getElementById('dispatch-rel').innerHTML = deltaSpan(rel);
    document.getElementById('dispatch-gdp').innerHTML = deltaSpan(gdp);
    document.getElementById('dispatch-mil').innerHTML = deltaSpan(military);
    document.getElementById('dispatch-apr').innerHTML = deltaSpan(approval);
    document.getElementById('dispatch-effects-section').classList.remove('hidden');

    const ack = document.getElementById('dispatch-acknowledge');
    ack.textContent = 'ACKNOWLEDGE DISPATCH';
    ack.disabled    = false;
}

function closeDispatch() {
    document.getElementById('dispatch-overlay').classList.remove('active');
    document.getElementById('response-idle')?.classList.remove('hidden');
}

function acknowledgeDispatch() {
    closeDispatch();
    GameState.selectedAction = null;
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
    const excludeId = pendingTargetNationId;
    pendingTargetNationId = null;
    setTimeout(() => resolveAIAutoActions(excludeId), 220);
}

// ============================================================
// EVENT OVERLAY (fallback compat)
// ============================================================

function showEventOverlay(event, callback) {
    const headlineEl    = document.getElementById('event-headline');
    const subheadlineEl = document.getElementById('event-subheadline');
    if (headlineEl)    headlineEl.textContent    = event.name;
    if (subheadlineEl) subheadlineEl.textContent = event.flavorText;

    const eff   = event.immediateEffect;
    const parts = [];
    if (eff.gdp         !== 0) parts.push(`GDP ${fmtDelta(eff.gdp)}`);
    if (eff.military    !== 0) parts.push(`MILITARY ${fmtDelta(eff.military)}`);
    if (eff.approval    !== 0) parts.push(`APPROVAL ${fmtDelta(eff.approval)}`);
    if (eff.allRelations !== 0) parts.push(`ALL RELATIONS ${fmtDelta(eff.allRelations)}`);

    const effectsEl = document.getElementById('event-effects');
    if (effectsEl) effectsEl.textContent = parts.length ? 'IMMEDIATE EFFECTS: ' + parts.join(' | ') : 'No immediate stat effects.';

    const modNote = document.getElementById('event-modifier-note');
    if (modNote) {
        if (event.cascadeRule) {
            modNote.textContent = `CASCADE ACTIVE: ${event.cascadeRule.longDesc}`;
            modNote.classList.remove('hidden');
        } else {
            modNote.classList.add('hidden');
        }
    }

    const dismissBtn = document.getElementById('btn-event-dismiss');
    if (dismissBtn) {
        dismissBtn._callback = callback;
        document.getElementById('event-overlay')?.classList.add('active');
    } else {
        if (typeof callback === 'function') callback();
    }
}

function dismissEventOverlay() {
    const overlay = document.getElementById('event-overlay');
    const cb = document.getElementById('btn-event-dismiss')?._callback;
    overlay?.classList.remove('active');
    if (typeof cb === 'function') cb();
}

function updateEventTicker(event) {
    const ticker   = document.getElementById('event-ticker');
    const tickerText = document.getElementById('event-ticker-text');
    if (!ticker || !tickerText) return;
    tickerText.textContent = event.cascadeRule ? event.cascadeRule.description : event.name;
    ticker.classList.remove('hidden');
}

function clearEventTicker() {
    document.getElementById('event-ticker')?.classList.add('hidden');
}

// ============================================================
// ROUND MANAGEMENT
// ============================================================

function advanceRound() {
    if (currentRoundRecord) {
        GameState.history.push({ ...currentRoundRecord });
        currentRoundRecord = null;
    }

    if (GameState.pendingRetaliations && GameState.pendingRetaliations.length > 0) {
        GameState.pendingRetaliations.forEach(retaliation => {
            applyDeltas(retaliation.gdp, 0, retaliation.approval);
            addLog('ai', `[RETALIATION] ${retaliation.nationName} follows through — sanctions hit back.`);
        });
        GameState.pendingRetaliations = [];
        ['gdp', 'military', 'approval'].forEach(k => {
            GameState.stats[k] = clamp(GameState.stats[k], 0, 100);
        });
        updateStats();
    }

    if (GameState.round >= GameState.maxRounds) {
        endGame();
        return;
    }

    tickCascades();

    GameState.round++;
    GameState.influenceTokens = 3;
    renderInfluenceGems();
    GameState.selectedAction = null;
    GameState.currentEvent   = null;
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));

    if (GameState.round === 2 || GameState.round === 4) {
        const event = drawWorldEvent();
        if (event) {
            GameState.currentEvent = event;

            showWorldEventBanner(event, () => {
                applyWorldEvent(event);
                updateEventTicker(event);
                currentRoundRecord = { round: GameState.round, eventHeadline: event.name, playerAction: null, autoActions: [] };
                GameState.phase = 'select-action';
                addLog('system',  `――― ROUND ${GameState.round} BEGINS ―――`);
                addLog('event',   `[GLOBAL EVENT] ${event.name}: ${event.logMessage}`);
                updateLastAction(`⚡ ${event.name} — ${event.cascadeRule ? event.cascadeRule.description : 'No cascade.'} | Your turn.`);
                renderRound();
                renderPhase();
                updateStats();
                renderAINations();
                renderCascadePills();
                startRoundTimer();
            });
            return;
        }
    }

    GameState.phase = 'select-action';
    currentRoundRecord = { round: GameState.round, eventHeadline: null, playerAction: null, autoActions: [] };
    addLog('system', `――― ROUND ${GameState.round} BEGINS ―――`);
    updateLastAction(`Round ${GameState.round} — select an action and click a nation.`);
    renderRound();
    renderPhase();
    renderCascadePills();
    startRoundTimer();
}

function endGame() {
    GameState.phase = 'game-over';
    clearRoundTimer();
    addLog('system', '════════ DIPLOMATIC TERM CONCLUDED ════════');
    renderPhase();
    setTimeout(() => renderEndGame(), 1500);
}

// ============================================================
// HISTORY SIDEBAR (compat)
// ============================================================

function toggleHistorySidebar() {
    const overlay = document.getElementById('history-overlay');
    if (!overlay) return;
    const isOpen = overlay.classList.contains('active');
    if (isOpen) {
        overlay.classList.remove('active');
    } else {
        renderHistoryLog();
        overlay.classList.add('active');
    }
}

function renderHistoryLog() {
    const content = document.getElementById('history-content');
    if (!content) return;
    const allRounds = [...GameState.history];
    if (currentRoundRecord && (currentRoundRecord.playerAction || currentRoundRecord.eventHeadline)) {
        allRounds.push(currentRoundRecord);
    }
    if (!allRounds.length) {
        content.innerHTML = '<div style="color:rgba(255,255,255,0.3);padding:12px;font-size:11px">No diplomatic actions recorded yet.</div>';
        return;
    }
    content.innerHTML = allRounds.map(buildRoundHTML).join('');
}

function buildRoundHTML(record) {
    let html = `<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">`;
    html += `<div style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.35);margin-bottom:6px">ROUND ${record.round}</div>`;
    if (record.eventHeadline) {
        html += `<div style="font-size:10px;color:#ffbe0b;margin-bottom:4px">⚡ ${record.eventHeadline}</div>`;
    }
    if (record.playerAction) {
        const pa = record.playerAction;
        html += `<div style="font-size:11px;font-weight:600;color:#fff;margin-bottom:2px">${pa.actionLabel} → ${pa.targetName}</div>`;
        html += `<div style="font-size:10px;color:rgba(255,255,255,0.55);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">"${pa.responseText}"</div>`;
        html += `<div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:3px">REL ${fmtDelta(pa.relationChange)} · GDP ${fmtDelta(pa.statEffects.gdp)} · MIL ${fmtDelta(pa.statEffects.military)} · APR ${fmtDelta(pa.statEffects.approval)}</div>`;
    }
    html += `</div>`;
    return html;
}

// ============================================================
// SCORING
// ============================================================

function calculateScore() {
    const { gdp, military, approval } = GameState.stats;
    const base  = Math.round((gdp + military + approval) / 3);
    const bonus = GameState.objectiveCompleted ? (GameState.objective?.bonusScore || 0) : 0;
    return base + bonus;
}

function getVerdict(score) {
    if (score >= 80) return { verdict: 'HEGEMON',          detail: 'Your nation dominated the diplomatic stage. History will remember this term.' };
    if (score >= 65) return { verdict: 'GREAT POWER',      detail: 'A successful term. Your nation stands respected among world powers.' };
    if (score >= 50) return { verdict: 'REGIONAL LEADER',  detail: 'You held your ground. Challenges remain, but the nation is stable.' };
    if (score >= 35) return { verdict: 'STRUGGLING STATE', detail: 'Significant difficulties emerged. The next administration inherits real problems.' };
    return                  { verdict: 'FAILED STATE',     detail: 'Your diplomatic term ended in near-catastrophe. The nation is in crisis.' };
}

function getReputationTier(rep) {
    if (rep > 70) return 'Diplomat';
    if (rep > 30) return 'Hegemon';
    return 'Warmonger';
}

// ============================================================
// END GAME SCREEN
// ============================================================

async function renderEndGame() {
    const score = calculateScore();
    const { verdict, detail } = getVerdict(score);
    const { isNew, prev }     = checkAndSaveHighScore(score);

    // Save prestige
    savePrestige(score);

    // Flip player card to reveal score on back face
    const backScoreEl = document.getElementById('final-score-big');
    if (backScoreEl) backScoreEl.textContent = score;
    const cardWrap = document.getElementById('player-card-wrap');
    if (cardWrap) {
        cardWrap.classList.add('flipped');
        await sleep(900);
    }

    showScreen('screen-endgame');

    document.getElementById('endgame-nation').textContent  = GameState.playerCountry.name;
    document.getElementById('endgame-verdict').textContent = verdict;
    document.getElementById('endgame-detail').textContent  = detail;
    document.getElementById('score-total').textContent     = score;

    const tierEl = document.getElementById('endgame-rep-tier');
    if (tierEl) {
        const tier = getReputationTier(GameState.reputation);
        const tierColors = { Diplomat: '#06d6a0', Hegemon: '#ffbe0b', Warmonger: '#ff3860' };
        tierEl.textContent = `${tier.toUpperCase()} TIER`;
        tierEl.style.background  = tierColors[tier] + '22';
        tierEl.style.borderColor = tierColors[tier] + '55';
        tierEl.style.color       = tierColors[tier];
    }

    const badge = document.getElementById('high-score-badge');
    if (isNew) {
        badge.textContent = '★ NEW HIGH SCORE';
        badge.classList.remove('hidden');
    } else {
        badge.textContent = `BEST ${prev}`;
        badge.classList.remove('hidden');
    }

    const footerHs = document.getElementById('eg-highscore-val');
    if (footerHs) footerHs.textContent = getHighScore();

    const { gdp, military, approval } = GameState.stats;
    document.getElementById('score-gdp').textContent      = gdp;
    document.getElementById('score-military').textContent  = military;
    document.getElementById('score-approval').textContent  = approval;

    // Archetype badge
    const badgeContainer = document.getElementById('archetype-badge-container');
    if (badgeContainer) {
        const { color } = renderArchetypeBadge(badgeContainer);
        setTimeout(() => {
            const rect = badgeContainer.getBoundingClientRect();
            spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, color, 20);
        }, 300);
    }

    // Objective injection
    const scoreMethod = document.querySelector('.score-method');
    if (scoreMethod) {
        const existing = scoreMethod.parentNode.querySelector('.objective-result-line');
        if (existing) existing.remove();
        if (GameState.objective) {
            const objLine = document.createElement('div');
            objLine.className = 'objective-result-line';
            if (GameState.objectiveCompleted) {
                objLine.textContent = `OBJECTIVE COMPLETE — ${GameState.objective.name} — +${GameState.objective.bonusScore} pts`;
                objLine.style.color = '#2dc653';
            } else {
                objLine.textContent = `OBJECTIVE INCOMPLETE — ${GameState.objective.name}`;
                objLine.style.color = 'rgba(255,255,255,0.35)';
            }
            scoreMethod.insertAdjacentElement('afterend', objLine);
        }
    }

    requestAnimationFrame(() => {
        setTimeout(() => {
            setEndBar('es-bar-gdp',      gdp);
            setEndBar('es-bar-military', military);
            setEndBar('es-bar-approval', approval);
        }, 120);
    });

    renderRelationshipMap();
    generateAnalysis(score);
    generateDiplomaticAssessment();
}

async function generateDiplomaticAssessment() {
    const detailEl = document.getElementById('endgame-detail');
    if (!detailEl) return;

    detailEl.textContent = '...';

    const movesSummary = GameState.moveHistory.map(m =>
        `Round ${m.round}: ${m.actionLabel} → ${m.targetName}`
    ).join('; ');

    const prompt = (
        `The player represented ${GameState.playerCountry.name}. ` +
        `Their moves were: ${movesSummary || 'no recorded moves'}. ` +
        `Final stats: GDP ${GameState.stats.gdp}, Military ${GameState.stats.military}, Approval ${GameState.stats.approval}. ` +
        `Reputation score: ${GameState.reputation}/100. ` +
        `Write a 3-4 sentence diplomatic assessment in the voice of a geopolitical analyst. ` +
        `Cover: the player's overall strategic style, their single most consequential decision, and how the AI nations responded to their approach. ` +
        `Use formal but readable prose. No bullet points or headers.`
    );

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type':                              'application/json',
                'x-api-key':                                 API_KEY,
                'anthropic-version':                         '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model:      API_MODEL,
                max_tokens: 280,
                system:     'You are a senior geopolitical analyst writing a concise post-game diplomatic assessment. Write exactly 3-4 sentences. Be specific about the player\'s choices. Do not use bullet points or headers.',
                messages:   [{ role: 'user', content: prompt }],
            }),
        });

        if (!res.ok) throw new Error(`Assessment API ${res.status}`);
        const data = await res.json();
        const text = (data.content?.[0]?.text ?? '').trim();
        if (text) {
            detailEl.textContent = '';
            await typeText(detailEl, text, 12);
        }
    } catch (err) {
        console.error('[Assessment API]', err);
        const fallback = generateFallbackAnalysis({
            playerCountry:  GameState.playerCountry,
            moveHistory:    GameState.moveHistory,
            finalStats:     { ...GameState.stats },
            finalRelations: { ...GameState.relations },
            aiNations:      GameState.aiNations,
            score:          calculateScore(),
        });
        detailEl.textContent = '';
        await typeText(detailEl, fallback, 12);
    }
}

function setEndBar(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width      = clamp(value, 0, 100) + '%';
    el.style.background = colorForValue(value);
}

function renderRelationshipMap() {
    const grid = document.getElementById('rel-map-grid');
    if (!grid) return;
    grid.innerHTML = '';

    GameState.aiNations.forEach((nation, i) => {
        const rel   = GameState.relations[nation.id];
        const cat   = getRelationCategory(rel);
        const color = getRelationColor(rel);
        const label = getRelationLabel(rel);
        const cardColor = CARD_COLORS[(i + 1) % CARD_COLORS.length];

        const card = document.createElement('div');
        card.className = `rel-map-card rel-cat-${cat}`;
        card.innerHTML = `
            <div class="rmc-top" style="background:${cardColor}">
                <span class="rmc-flag">${countryFlag(nation.code)}</span>
            </div>
            <div class="rmc-bottom">
                <div class="rmc-name">${nation.name}</div>
                <div class="rmc-status" style="color:${color}">${label}</div>
                <div class="rmc-score" style="color:${color}">${rel > 0 ? '+' : ''}${rel}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function generateAnalysis(score) {
    const loadingEl = document.getElementById('analysis-loading');
    const textEl    = document.getElementById('analysis-text');
    const cursorEl  = document.getElementById('analysis-cursor');

    loadingEl.classList.remove('hidden');
    textEl.textContent = '';
    cursorEl?.classList.add('hidden');

    try {
        const text = await callAnthropicForAnalysis({
            playerCountry:  GameState.playerCountry,
            moveHistory:    GameState.moveHistory,
            finalStats:     { ...GameState.stats },
            finalRelations: { ...GameState.relations },
            aiNations:      GameState.aiNations,
            score,
        });
        loadingEl.classList.add('hidden');
        cursorEl?.classList.remove('hidden');
        await typeText(textEl, text, 11);
        cursorEl?.classList.add('hidden');
    } catch (err) {
        console.error('[Analysis API]', err);
        loadingEl.classList.add('hidden');
        const fallback = generateFallbackAnalysis({
            playerCountry:  GameState.playerCountry,
            moveHistory:    GameState.moveHistory,
            finalStats:     { ...GameState.stats },
            finalRelations: { ...GameState.relations },
            aiNations:      GameState.aiNations,
            score,
        });
        cursorEl?.classList.remove('hidden');
        await typeText(textEl, fallback, 11);
        cursorEl?.classList.add('hidden');
    }
}

// ============================================================
// EVENT LOG (hidden, kept for compat)
// ============================================================

function addLog(type, text) {
    GameState.log.push({ type, text });
    const logEl = document.getElementById('event-log');
    if (!logEl) return;
    const entry = document.createElement('div');
    entry.className   = `log-entry log-${type}`;
    entry.textContent = text;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
    GameState.log = [];
    const el = document.getElementById('event-log');
    if (el) el.innerHTML = '';
}

// ============================================================
// ANTHROPIC API — Diplomatic Response
// ============================================================

async function callAnthropicAPI(context) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type':                              'application/json',
            'x-api-key':                                 API_KEY,
            'anthropic-version':                         '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model:      API_MODEL,
            max_tokens: 1000,
            system:     buildSystemPrompt(context.targetNation, context.playerCountry),
            messages:   [{ role: 'user', content: buildUserMessage(context) }],
        }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data    = await res.json();
    const rawText = data.content?.[0]?.text ?? '';
    const parsed  = extractJSON(rawText);
    if (!parsed) throw new Error('JSON parse failed');

    return {
        response_text:       String(parsed.response_text ?? ''),
        relationship_change: clamp(Math.round(Number(parsed.relationship_change) || 0), -20, 20),
        stat_effects: {
            gdp:      clamp(Math.round(Number(parsed.stat_effects?.gdp      ?? 0)), -10, 10),
            military: clamp(Math.round(Number(parsed.stat_effects?.military ?? 0)), -10, 10),
            approval: clamp(Math.round(Number(parsed.stat_effects?.approval ?? 0)), -10, 10),
        },
    };
}

// ============================================================
// ANTHROPIC API — Post-game Analysis
// ============================================================

async function callAnthropicForAnalysis(context) {
    const res = await fetch('https://corsproxy.io/?' + API_URL, {
        method: 'POST',
        headers: {
            'Content-Type':                              'application/json',
            'x-api-key':                                 API_KEY,
            'anthropic-version':                         '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model:      API_MODEL,
            max_tokens: 320,
            system:     'You are a senior Cold War political analyst writing a classified after-action assessment. Write exactly one paragraph of 3–4 sentences. Use precise, formal intelligence-report language. Reference the player\'s specific choices. Do not use bullet points or headers.',
            messages:   [{ role: 'user', content: buildAnalysisPrompt(context) }],
        }),
    });

    if (!res.ok) throw new Error(`Analysis API ${res.status}`);
    const data = await res.json();
    return (data.content?.[0]?.text ?? '').trim();
}

// ============================================================
// ANTHROPIC API — Pre-game Strategic Briefing
// ============================================================

async function callAnthropicForBriefing(context) {
    const { playerCountry, aiNations, stats } = context;
    const adversaries = aiNations
        .map(n => `${n.name} (${PERSONALITIES[n.personality].label})`)
        .join(', ');

    const prompt = (
        `Write a classified 2-sentence strategic briefing for a diplomat representing ${playerCountry.name} (${playerCountry.region}). ` +
        `Starting national indicators: GDP ${stats.gdp}/100, Military ${stats.military}/100, Public Approval ${stats.approval}/100. ` +
        `They face three adversaries this term: ${adversaries}. ` +
        `Sentence 1: describe ${playerCountry.name}'s current geopolitical position and relative strengths or vulnerabilities. ` +
        `Sentence 2: identify the key strategic challenge given the adversary mix. ` +
        `Use formal classified intelligence language. Write exactly 2 sentences, no more.`
    );

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 6000);

    try {
        const res = await fetch('https://corsproxy.io/?' + API_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type':                              'application/json',
                'x-api-key':                                 API_KEY,
                'anthropic-version':                         '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model:      API_MODEL,
                max_tokens: 150,
                system:     'You are a Cold War intelligence analyst. Write precise, formal classified briefing text — no headers, no bullets, exactly 2 sentences.',
                messages:   [{ role: 'user', content: prompt }],
            }),
        });

        if (!res.ok) throw new Error(`Briefing API ${res.status}`);
        const data = await res.json();
        return (data.content?.[0]?.text ?? '').trim();
    } finally {
        clearTimeout(timeout);
    }
}

// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildSystemPrompt(targetNation, playerCountry) {
    const p = PERSONALITIES[targetNation.personality];

    let cascadeContext = '';
    if (GameState.activeCascades.length > 0) {
        const cascadeDescriptions = GameState.activeCascades.map(c => c.description).join(', ');
        cascadeContext = `\n\nACTIVE GAME MODIFIERS: ${cascadeDescriptions}.`;

        const leakCascade = GameState.activeCascades.find(c => c.type === 'ai_objective_aware');
        if (leakCascade && GameState.objective) {
            cascadeContext += ` INTELLIGENCE LEAK: The player's strategic objective has been partially exposed: ${GameState.objective.name}.`;
        }
    }

    return (
        `You are the head of state and foreign minister of ${targetNation.name}, a nation in ${targetNation.region}. ` +
        `Your diplomatic archetype is: ${p.label}.\n\n${p.systemContext}\n\n` +
        `You are engaged in a five-round geopolitical negotiation simulation with ${playerCountry.name}. ` +
        `Respond ONLY with a valid JSON object — no preamble, no markdown, nothing outside the braces:\n` +
        `{\n  "response_text": "<2-3 sentences, in-character diplomatic communiqué>",\n` +
        `  "relationship_change": <integer -20 to 20>,\n` +
        `  "stat_effects": {\n    "gdp": <integer -10 to 10>,\n` +
        `    "military": <integer -10 to 10>,\n    "approval": <integer -10 to 10>\n  }\n}` +
        cascadeContext
    );
}

function buildUserMessage(ctx) {
    const { playerCountry, targetNation, actionId, round, relations, stats } = ctx;
    const action = ACTIONS[actionId];
    const rel    = relations[targetNation.id];

    return (
        `Round ${round} of 5. ${playerCountry.name} has directed the following toward your nation:\n\n` +
        `ACTION: ${action.label}\nDESCRIPTION: ${action.description}\n\n` +
        `Current relations score: ${getRelationLabel(rel)} (${rel})\n` +
        `Their stats: GDP ${stats.gdp}/100 | Military ${stats.military}/100 | Approval ${stats.approval}/100\n\n` +
        `Respond in character in formal Cold War diplomatic language, calibrated to your archetype and the current relations level.\n\n` +
        `Guidance:\n` +
        `— response_text: 2-3 sentences of in-character diplomatic communiqué responding to this action\n` +
        `— relationship_change: how this shifts your view of ${playerCountry.name} (+20 = greatly improved, -20 = severely damaged)\n` +
        `— stat_effects: immediate impact on ${playerCountry.name}'s GDP, military capability, and domestic approval from YOUR response\n\n` +
        `Return ONLY the JSON object.`
    );
}

function buildAnalysisPrompt(ctx) {
    const { playerCountry, moveHistory, finalStats, finalRelations, aiNations, score } = ctx;

    const moves = moveHistory.map(m =>
        `  Round ${m.round}: ${m.actionLabel} toward ${m.targetName} (${PERSONALITIES[m.targetPersonality]?.label || m.targetPersonality})` +
        ` — Relations ${m.relationChange >= 0 ? '+' : ''}${m.relationChange}`
    ).join('\n');

    const rels = aiNations.map(n => {
        const r = finalRelations[n.id];
        return `${n.name} (${PERSONALITIES[n.personality].label}): ${getRelationLabel(r)} (${r >= 0 ? '+' : ''}${r})`;
    }).join('; ');

    const objLine = GameState.objective
        ? `\nSecret objective: ${GameState.objective.name} — ${GameState.objectiveCompleted ? 'COMPLETED (+' + GameState.objective.bonusScore + ' pts)' : 'not completed'}.`
        : '';

    return (
        `A player represented ${playerCountry.name} in a five-round diplomatic simulation:\n\n${moves}\n\n` +
        `Final stats: GDP ${finalStats.gdp}/100 | Military ${finalStats.military}/100 | Approval ${finalStats.approval}/100\n` +
        `Final score: ${score}/100` + objLine + `\n` +
        `Final relations: ${rels}\n\n` +
        `Write one analytical paragraph (3–4 sentences) characterizing this player's diplomatic style. ` +
        `Be specific about their choices. Note patterns, contradictions, or strategic tendencies. ` +
        `Assess effectiveness. Use precise, formal intelligence-analyst language.`
    );
}

function generateFallbackAnalysis(ctx) {
    const { moveHistory, finalStats, finalRelations, aiNations, score } = ctx;
    const db = ANALYSIS_DATABASE;

    // 1. Determine playstyle profile
    const tally = { trade: 0, sanctions: 0, alliance: 0 };
    (moveHistory || []).forEach(m => {
        const id = m.actionId || '';
        if (id in tally) tally[id]++;
    });

    let profileKey = 'balanced';
    if (tally.sanctions >= 3)      profileKey = 'aggressive';
    else if (tally.alliance >= 3)  profileKey = 'diplomatic';
    else if (tally.trade >= 3)     profileKey = 'mercantile';
    else {
        const actions = (moveHistory || []).map(m => m.actionId).filter(Boolean);
        let switches = 0;
        for (let i = 1; i < actions.length; i++) {
            if (actions[i] !== actions[i - 1]) switches++;
        }
        if (actions.length >= 3 && switches >= actions.length - 1) profileKey = 'erratic';
    }
    const profile = db.PLAYSTYLE_PROFILES[profileKey];

    // 2. Outcome tier
    let outcomeKey = 'average';
    if (score >= 80)      outcomeKey = 'elite';
    else if (score >= 60) outcomeKey = 'strong';
    else if (score >= 40) outcomeKey = 'average';
    else if (score >= 20) outcomeKey = 'weak';
    else                  outcomeKey = 'failure';
    const outcomeLine = db.OUTCOME_COMMENTARY[outcomeKey];

    // 3. Up to two stat fragments
    const { gdp, military, approval } = finalStats;
    const frags = [];
    if (gdp > 65)             frags.push(db.STAT_COMMENTARY.gdp_high);
    else if (gdp < 35)        frags.push(db.STAT_COMMENTARY.gdp_low);
    if (military > 65)        frags.push(db.STAT_COMMENTARY.military_high);
    else if (military < 35)   frags.push(db.STAT_COMMENTARY.military_low);
    if (frags.length < 2) {
        if (approval > 65)    frags.push(db.STAT_COMMENTARY.approval_high);
        else if (approval < 35) frags.push(db.STAT_COMMENTARY.approval_low);
    }

    let statSentence = '';
    if (frags.length === 2)      statSentence = `The nation closed the term ${frags[0]} while ${frags[1]}.`;
    else if (frags.length === 1) statSentence = `The nation closed the term ${frags[0]}.`;

    // 4. Relation commentary
    let allied = 0, hostile = 0;
    (aiNations || []).forEach(n => {
        const r = finalRelations[n.id] ?? 0;
        if (r >= 20)      allied++;
        else if (r < -20) hostile++;
    });
    const n3 = (aiNations || []).length || 3;
    let relKey = 'mixed';
    if (allied === n3)       relKey = 'all_allied';
    else if (allied >= 2)    relKey = 'mostly_allied';
    else if (hostile === n3) relKey = 'all_hostile';
    else if (hostile >= 2)   relKey = 'mostly_hostile';
    const relLine = db.RELATION_COMMENTARY[relKey];

    // 5. Objective commentary
    const objLine = GameState.objective
        ? (GameState.objectiveCompleted
            ? db.OBJECTIVE_COMMENTARY.completed
            : db.OBJECTIVE_COMMENTARY.failed)
        : '';

    // Assemble
    const parts = [profile.opening, profile.tendency];
    if (statSentence) parts.push(statSentence);
    parts.push(outcomeLine, relLine);
    if (objLine) parts.push(objLine);
    return parts.join(' ');
}

function extractJSON(text) {
    try { return JSON.parse(text.trim()); } catch {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}

// ============================================================
// NEW TABLETOP FUNCTIONS
// ============================================================

function repositionHandCards() {
    const container = document.getElementById('actions-grid');
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.hand-card:not(.hidden)'));
    const n = cards.length;
    if (!n) return;
    const maxAngle = n > 1 ? 6 : 0;
    cards.forEach((card, i) => {
        const t     = n === 1 ? 0 : i / (n - 1);
        const angle = -maxAngle + t * maxAngle * 2;
        const norm  = (t - 0.5) * 2;
        const raise = norm * norm * 8;
        card.style.setProperty('--card-rotate', angle.toFixed(1) + 'deg');
        card.style.setProperty('--card-raise',  raise.toFixed(1) + 'px');
    });
}

function renderInfluenceGems() {
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`gem-${i}`);
        if (!el) continue;
        el.classList.toggle('gem-spent', i >= GameState.influenceTokens);
    }
    updateHandCardAffordability();
}

function updateHandCardAffordability() {
    document.querySelectorAll('.hand-card').forEach(card => {
        const cost = ACTION_COSTS[card.dataset.action] || 0;
        card.classList.toggle('insufficient', cost > 0 && GameState.influenceTokens < cost);
    });
}

function spawnParticles(x, y, color, count) {
    const existing = document.querySelectorAll('.particle').length;
    count = Math.min(count, 30 - existing);
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.cssText = `left:${x}px;top:${y}px;background:${color};opacity:1`;
        document.body.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed - 2;
        let ox = x, oy = y, alpha = 1;
        const tick = () => {
            vy += 0.12; ox += vx; oy += vy; alpha -= 0.022;
            p.style.left = ox + 'px'; p.style.top = oy + 'px'; p.style.opacity = alpha;
            if (alpha > 0) requestAnimationFrame(tick); else p.remove();
        };
        requestAnimationFrame(tick);
    }
}

function getPlaystyleArchetype() {
    const tally = { trade: 0, sanctions: 0, alliance: 0 };
    GameState.moveHistory.forEach(m => { if (m.actionId in tally) tally[m.actionId]++; });
    const total = GameState.moveHistory.length || 1;
    if (tally.sanctions / total >= 0.5) return 'warmonger';
    if (tally.alliance  / total >= 0.5) return 'statesman';
    if (tally.trade     / total >= 0.5) return 'merchant';
    const { gdp, military, approval } = GameState.stats;
    if (Math.max(gdp, military, approval) - Math.min(gdp, military, approval) < 25) return 'pragmatist';
    return 'opportunist';
}

function renderArchetypeBadge(container) {
    const archetypes = {
        warmonger:   { icon: '🛡', name: 'Warmonger',   color: '#e63946', desc: 'You ruled through force and coercion. Nations feared your sanctions but rarely respected your leadership.' },
        statesman:   { icon: '🕊', name: 'Statesman',   color: '#3a86ff', desc: 'You built alliances and earned goodwill abroad. Your term will be remembered as an era of cooperation.' },
        merchant:    { icon: '🪙', name: 'Merchant',    color: '#f0c040', desc: 'Trade was your primary tool. You enriched the nation by keeping commerce flowing across borders.' },
        pragmatist:  { icon: '⚖️', name: 'Pragmatist',  color: '#888888', desc: 'You balanced competing interests with steady judgment. No single doctrine defined your approach.' },
        opportunist: { icon: '👁', name: 'Opportunist', color: '#7b2d8b', desc: 'You adapted to shifting conditions and exploited openings as they arose. Principle took a back seat to results.' },
    };
    const key = getPlaystyleArchetype();
    const a   = archetypes[key] || archetypes.pragmatist;
    container.innerHTML = `
        <div class="archetype-badge" style="--badge-color:${a.color}">
            <span style="font-size:28px;line-height:1">${a.icon}</span>
        </div>
        <div class="archetype-name" style="--badge-color:${a.color}">${a.name}</div>
        <div class="archetype-desc">${a.desc}</div>
    `;
    return { color: a.color };
}

function savePrestige(score) {
    const current = parseInt(localStorage.getItem(PRESTIGE_KEY) || '0', 10);
    const games   = parseInt(localStorage.getItem(GAMES_KEY)    || '0', 10);
    const earned  = Math.floor(score / 10);
    localStorage.setItem(PRESTIGE_KEY, String(current + earned));
    localStorage.setItem(GAMES_KEY,    String(games + 1));
    return current + earned;
}

function getPrestigeTier(total) {
    if (total >= 100) return { name: 'Hegemon',    cssClass: 'tier-hegemon',    shimmer: true };
    if (total >= 50)  return { name: 'Chancellor', cssClass: 'tier-chancellor', shimmer: false };
    if (total >= 25)  return { name: 'Minister',   cssClass: 'tier-minister',   shimmer: false };
    if (total >= 10)  return { name: 'Statesman',  cssClass: 'tier-statesman',  shimmer: false };
    return                   { name: 'Diplomat',   cssClass: 'tier-diplomat',   shimmer: false };
}

function checkPrestigeDisplay() {
    const total = parseInt(localStorage.getItem(PRESTIGE_KEY) || '0', 10);
    const games = parseInt(localStorage.getItem(GAMES_KEY)    || '0', 10);
    const el    = document.getElementById('prestige-display');
    if (!el) return;
    if (!games) { el.style.display = 'none'; return; }
    const tier = getPrestigeTier(total);
    el.innerHTML = `
        <span class="prestige-tier-badge ${tier.cssClass}">${tier.name}</span>
        <span class="prestige-points">${total} prestige</span>
    `;
    el.style.display = 'flex';
    // Gold shimmer on player card for top tier
    document.getElementById('player-card-wrap')?.classList.toggle('prestige-shimmer', tier.shimmer);
}

async function runEspionageOnCard(nationCardEl, nation) {
    GameState.influenceTokens = Math.max(0, GameState.influenceTokens - 1);
    renderInfluenceGems();

    addLog('player', `[ESPIONAGE] Covert intelligence operation on ${nation.name}.`);
    GameState.moveHistory.push({
        round:             GameState.round,
        actionId:          'espionage',
        actionLabel:       'ESPIONAGE',
        targetName:        nation.name,
        targetPersonality: nation.personality,
        relationChange:    0,
    });

    const espCard = document.getElementById('action-espionage');
    if (espCard) {
        espCard.classList.add('espionage-peek');
        espCard.addEventListener('animationend', () => espCard.classList.remove('espionage-peek'), { once: true });
    }

    try {
        const intelCall    = callAnthropicForIntel({
            targetNation:  nation,
            playerCountry: GameState.playerCountry,
            relations:     { ...GameState.relations },
            stats:         { ...GameState.stats },
            revealType:    'hidden_agenda',
        });
        const intelTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('intel timeout')), 13000)
        );
        const resultText = await Promise.race([intelCall, intelTimeout]);
        showIntelPopup(nation, resultText);
    } catch (err) {
        console.error('[Espionage]', err);
        showIntelPopup(nation, `[CLASSIFIED] ${nation.hiddenAgenda || 'Signal lost — intelligence intercept failed.'}`);
    }

    GameState.objectiveTracking.minGdp = Math.min(GameState.objectiveTracking.minGdp, GameState.stats.gdp);
    evaluateObjective();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('btn-start')
        ?.addEventListener('click', initGame);

    document.getElementById('btn-begin-mission')
        ?.addEventListener('click', startMission);

    document.getElementById('btn-restart')
        ?.addEventListener('click', () => {
            document.getElementById('player-card-wrap')?.classList.remove('flipped');
            document.querySelectorAll('.nation-card').forEach(c => c.remove());
            showScreen('screen-intro');
            checkPrestigeDisplay();
        });

    document.getElementById('dispatch-acknowledge')
        ?.addEventListener('click', acknowledgeDispatch);

    document.getElementById('btn-event-dismiss')
        ?.addEventListener('click', dismissEventOverlay);

    document.getElementById('btn-history-toggle')
        ?.addEventListener('click', toggleHistorySidebar);

    document.getElementById('history-close')
        ?.addEventListener('click', toggleHistorySidebar);

    // Hand cards — click, hover, drag
    document.querySelectorAll('.hand-card').forEach(card => {
        card.addEventListener('click', () => {
            if (card.dataset.action) handleActionSelect(card.dataset.action);
        });
        card.addEventListener('mouseenter', () => { roundTimerPaused = true; });
        card.addEventListener('mouseleave', () => { roundTimerPaused = false; });

        card.addEventListener('dragstart', e => {
            const actionId = card.dataset.action;
            if (GameState.phase !== 'select-action') { e.preventDefault(); return; }
            const cost = ACTION_COSTS[actionId] || 0;
            if (cost > 0 && GameState.influenceTokens < cost) { e.preventDefault(); return; }
            GameState.selectedAction = actionId;
            document.querySelectorAll('.action-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('dragging', 'selected');
            renderPhase();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', actionId);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            if (GameState.phase === 'select-action') {
                card.classList.add('snap-back');
                card.addEventListener('animationend', () => card.classList.remove('snap-back'), { once: true });
            }
        });
    });

    // Nation cards as drop targets (event delegation)
    document.addEventListener('dragover', e => {
        const nc = e.target.closest('.nation-card');
        if (nc && GameState.phase === 'select-action' && GameState.selectedAction) {
            e.preventDefault();
            document.querySelectorAll('.nation-card').forEach(c => c.classList.remove('drag-over'));
            nc.classList.add('drag-over');
        }
    }, false);

    document.addEventListener('dragleave', e => {
        const nc = e.target.closest('.nation-card');
        if (nc) nc.classList.remove('drag-over');
    }, false);

    document.addEventListener('drop', e => {
        const nc = e.target.closest('.nation-card');
        if (!nc || GameState.phase !== 'select-action' || !GameState.selectedAction) return;
        e.preventDefault();
        document.querySelectorAll('.nation-card').forEach(c => c.classList.remove('drag-over'));
        document.querySelectorAll('.hand-card').forEach(c => c.classList.remove('dragging'));

        const idx    = parseInt(nc.dataset.nationIndex, 10);
        const nation = GameState.aiNations[idx];
        if (!nation) return;

        const actionId = GameState.selectedAction;

        clearRoundTimer();
        nc.classList.add('targeted');
        setTimeout(() => nc.classList.remove('targeted'), 600);
        GameState.phase = 'resolving';
        renderPhase();
        setTimeout(() => resolvePlayerAction(nation, actionId), 350);
    }, false);

    document.getElementById('btn-run-intel')
        ?.addEventListener('click', () => {
            if (GameState.intelTokens > 0 && GameState.phase === 'select-action') {
                GameState.phase = 'select-intel';
                renderPhase();
                addLog('player', 'Intelligence operation initiated — select a target nation.');
            }
        });

    document.getElementById('intel-popup-close')
        ?.addEventListener('click', () => {
            document.getElementById('intel-popup')?.classList.add('hidden');
        });

    document.getElementById('btn-web-event-dismiss')
        ?.addEventListener('click', () => {
            document.getElementById('world-event-banner')?.classList.add('hidden');
        });

    // Initialize on load
    checkPrestigeDisplay();
    repositionHandCards();

});
