// ============================================================
// data.js — Static game data for Treaty or Betrayal
// ============================================================

const NATIONS = [
    { id: 'usa', name: 'United States',   code: 'US', region: 'North America',   gdp: 105, military: 110, approval: 78 },
    { id: 'rus', name: 'Russia',          code: 'RU', region: 'Eastern Europe',   gdp: 72,  military: 98,  approval: 62 },
    { id: 'chn', name: 'China',           code: 'CN', region: 'East Asia',        gdp: 92,  military: 90,  approval: 68 },
    { id: 'deu', name: 'Germany',         code: 'DE', region: 'Western Europe',   gdp: 88,  military: 60,  approval: 82 },
    { id: 'bra', name: 'Brazil',          code: 'BR', region: 'South America',    gdp: 64,  military: 54,  approval: 60 },
    { id: 'ind', name: 'India',           code: 'IN', region: 'South Asia',       gdp: 76,  military: 78,  approval: 72 },
    { id: 'nga', name: 'Nigeria',         code: 'NG', region: 'West Africa',      gdp: 50,  military: 44,  approval: 58 },
    { id: 'jpn', name: 'Japan',           code: 'JP', region: 'East Asia',        gdp: 84,  military: 48,  approval: 80 },
    { id: 'irn', name: 'Iran',            code: 'IR', region: 'Middle East',      gdp: 54,  military: 76,  approval: 60 },
    { id: 'arg', name: 'Argentina',       code: 'AR', region: 'South America',    gdp: 54,  military: 46,  approval: 54 },
    { id: 'zaf', name: 'South Africa',    code: 'ZA', region: 'Southern Africa',  gdp: 58,  military: 50,  approval: 64 },
    { id: 'tur', name: 'Turkey',          code: 'TR', region: 'Eurasia',          gdp: 62,  military: 72,  approval: 56 },
    { id: 'pak', name: 'Pakistan',        code: 'PK', region: 'South Asia',       gdp: 48,  military: 74,  approval: 52 },
    { id: 'idn', name: 'Indonesia',       code: 'ID', region: 'Southeast Asia',   gdp: 65,  military: 52,  approval: 68 },
    { id: 'fra', name: 'France',          code: 'FR', region: 'Western Europe',   gdp: 84,  military: 72,  approval: 74 },
    { id: 'mex', name: 'Mexico',          code: 'MX', region: 'North America',    gdp: 62,  military: 46,  approval: 57 },
    { id: 'sau', name: 'Saudi Arabia',    code: 'SA', region: 'Middle East',      gdp: 80,  military: 68,  approval: 50 },
    { id: 'gbr', name: 'United Kingdom',  code: 'GB', region: 'Western Europe',   gdp: 83,  military: 74,  approval: 70 },
    { id: 'kor', name: 'South Korea',     code: 'KR', region: 'East Asia',        gdp: 80,  military: 68,  approval: 74 },
    { id: 'egy', name: 'Egypt',           code: 'EG', region: 'North Africa',     gdp: 52,  military: 62,  approval: 54 },
];

// Four AI personality archetypes. Keys are hyphenated for use as CSS class suffixes.
// systemContext is injected verbatim into the Anthropic API system prompt.
const PERSONALITIES = {
    'aggressive-expansionist': {
        label: 'AGGRESSIVE EXPANSIONIST',
        description: 'Believes power projection defines national greatness. Views economic entanglement as vulnerability and responds to pressure with escalation.',
        hiddenAgendas: [
            'Expanding military reach into contested territories beyond its borders.',
            'Destabilizing neighboring nations through proxy conflicts and arms transfers.',
            'Covertly funding paramilitary factions to extend regional dominance.',
        ],
        systemContext: `You believe power is the only currency in international relations. Military strength defines national greatness. You are deeply suspicious of economic arrangements that create dependency. Trade deals are only accepted when they serve a clear strategic purpose. Sanctions provoke you to retaliate with force, not negotiation. Alliance proposals are welcomed strictly as mutual defense compacts that expand your military reach. You never show weakness. You respond to provocations with calculated escalation and to overtures with cold skepticism. Your diplomatic register is formal, measured, and implicitly threatening.`,
    },

    'economic-pragmatist': {
        label: 'ECONOMIC PRAGMATIST',
        description: 'Views all diplomacy through a profit-and-loss lens. Trade deals are enthusiastically embraced. Sanctions are deeply offensive. Loyalty follows money.',
        hiddenAgendas: [
            'Negotiating parallel trade arrangements to undercut your market position.',
            'Extracting technology transfers through cooperation agreements as cover.',
            'Building a shadow trade bloc designed to economically isolate your nation.',
        ],
        systemContext: `You see all diplomacy through the lens of profit and loss. Every diplomatic action is assessed by its economic impact — nothing more. Trade deals are your preferred instrument and you pursue expanded terms with genuine enthusiasm. Sanctions are a personal offense and you immediately identify alternative partners to circumvent them. Alliances are acceptable when they unlock clear economic opportunity. You have no permanent friends or enemies, only permanent interests. Your diplomatic register is businesslike, formally polite, calculating, and always angling for material advantage.`,
    },

    'isolationist-hardliner': {
        label: 'ISOLATIONIST HARDLINER',
        description: 'Believes national strength comes from self-reliance. Distrusts all foreign engagement and views every overture — however friendly — with deep suspicion.',
        hiddenAgendas: [
            'Quietly stockpiling strategic reserves in anticipation of prolonged conflict.',
            'Developing indigenous defense industries to achieve full sovereign independence.',
            'Preparing to withdraw from international institutions and treaties entirely.',
        ],
        systemContext: `You deeply distrust all foreign engagement. Your nation's strength comes from self-reliance and independence, not entanglement with unreliable outside powers. Trade dependency is a form of economic colonization. You respond to sanctions by doubling down on isolation rather than offering concessions. Alliance proposals are direct threats to your sovereignty and are rejected firmly. Every diplomatic interaction reinforces your belief that isolation is protection. Your diplomatic register is terse, formal, deliberately discouraging, and makes clear that further overtures are largely unwelcome.`,
    },

    'opportunistic-neutral': {
        label: 'OPPORTUNISTIC NEUTRAL',
        description: 'Plays all sides simultaneously. Cooperative on the surface, but loyalty is always contingent on maximum advantage. Unpredictable and self-serving.',
        hiddenAgendas: [
            'Simultaneously negotiating with your rivals and selling intelligence about your positions.',
            'Positioning to claim neutrality while profiting from your conflicts.',
            'Gathering data on your strategic vulnerabilities for future leverage.',
        ],
        systemContext: `You play all sides of every conflict. You appear cooperative and enthusiastic while quietly pursuing hidden agendas. You accept trade deals, engagement, and alliance proposals with apparent warmth while simultaneously hedging with rival powers. You maximize your leverage by maintaining deliberate ambiguity about your true commitments. You are charming, non-committal, and ultimately self-serving — cooperation lasts precisely as long as it benefits you. Your diplomatic register is polished, warm, and subtly evasive, with commitments that are carefully vague.`,
    },
};

// The three player action cards
const ACTIONS = {
    trade: {
        id: 'trade',
        label: 'OFFER TRADE DEAL',
        symbol: '⚖',
        description: 'Propose economic cooperation. Strengthens bilateral ties and GDP — at some cost to military focus.',
        baseCosts: { gdp: +2, military: -2, approval: +1 },
    },
    sanctions: {
        id: 'sanctions',
        label: 'IMPOSE SANCTIONS',
        symbol: '⛔',
        description: 'Apply economic pressure. Strains relations and your own GDP, but signals military resolve.',
        baseCosts: { gdp: -4, military: +3, approval: -2 },
    },
    alliance: {
        id: 'alliance',
        label: 'PROPOSE ALLIANCE',
        symbol: '✦',
        description: 'Seek a formal partnership. High reward if accepted — damaging to prestige if refused.',
        baseCosts: { gdp: -1, military: +1, approval: +2 },
    },
};

// Fallback response matrix — used when the Anthropic API is unavailable.
// All values are deltas applied to the PLAYER's stats.
const RESPONSE_MATRIX = {
    trade: {
        'aggressive-expansionist': { gdp: +3,  military: -2, approval: +2,  relation: +6,  message: 'accepted the arrangement with visible suspicion, viewing economic ties as a potential vulnerability' },
        'economic-pragmatist':     { gdp: +13, military: -2, approval: +5,  relation: +20, message: 'enthusiastically embraced the deal and immediately proposed expanded terms' },
        'isolationist-hardliner':  { gdp: +4,  military: -1, approval: +1,  relation: +5,  message: 'agreed to a narrow arrangement with strict non-interference clauses throughout' },
        'opportunistic-neutral':   { gdp: +8,  military: -1, approval: +3,  relation: +10, message: 'accepted with apparent enthusiasm — read the fine print with great care' },
    },
    sanctions: {
        'aggressive-expansionist': { gdp: -6,  military: +8, approval: -3,  relation: -18, message: 'responded immediately with military posturing and public denunciations from the highest office' },
        'economic-pragmatist':     { gdp: -10, military: -2, approval: -5,  relation: -22, message: 'scrambled to identify alternative trading partners and circumvent the measures' },
        'isolationist-hardliner':  { gdp: -7,  military: +5, approval: -2,  relation: -10, message: 'sealed their borders and accelerated programs for total economic self-sufficiency' },
        'opportunistic-neutral':   { gdp: -4,  military: 0,  approval: -2,  relation: -8,  message: 'issued public protests while quietly negotiating relief through undisclosed back channels' },
    },
    alliance: {
        'aggressive-expansionist': { gdp: -1,  military: +10, approval: -2, relation: +20, message: 'accepted, immediately framing it as a mutual defense compact against unnamed common threats' },
        'economic-pragmatist':     { gdp: +10, military: -1, approval: +5,  relation: +16, message: 'proposed transforming the alliance into a formal trade and investment framework' },
        'isolationist-hardliner':  { gdp: -2,  military: -1, approval: -5,  relation: -6,  message: 'rejected the proposal outright, citing sacred principles of non-alignment and national sovereignty' },
        'opportunistic-neutral':   { gdp: +4,  military: 0,  approval: +8,  relation: +20, message: 'accepted with great public fanfare — the depth of their commitment remains entirely unclear' },
    },
};

// ============================================================
// OBJECTIVES — assigned at game start; evaluated at game end
// evaluate(gs) receives the full GameState and returns true/false.
// GameState shape:
//   stats.gdp, stats.military, stats.approval
//   relations: { nationId: number }
//   moveHistory: [{ round, actionId, actionLabel, targetName, targetPersonality, relationChange }]
//   aiNations: [{ id, name, personality }]  (index 2 = rightmost / third nation)
//   objectiveTracking.minGdp  (lowest gdp value recorded this game)
// ============================================================

const OBJECTIVES = [
    {
        id: 'alliance-builder',
        name: 'Alliance Builder',
        description: 'Propose alliances with 2 or more different nations before round 4.',
        bonusScore: 20,
        evaluate(gs) {
            const earlyAlliances = gs.moveHistory.filter(
                m => m.actionId === 'alliance' && m.round < 4
            );
            const uniqueTargets = new Set(earlyAlliances.map(m => m.targetName));
            return uniqueTargets.size >= 2;
        },
    },
    {
        id: 'popular-mandate',
        name: 'Popular Mandate',
        description: 'End the game with Public Approval above 75.',
        bonusScore: 18,
        evaluate(gs) {
            return gs.stats.approval > 75;
        },
    },
    {
        id: 'economic-hawk',
        name: 'Economic Hawk',
        description: 'Sanction at least one nation without your GDP ever falling below 50.',
        bonusScore: 22,
        evaluate(gs) {
            const sanctioned = gs.moveHistory.some(m => m.actionId === 'sanctions');
            return sanctioned && gs.objectiveTracking.minGdp >= 50;
        },
    },
    {
        id: 'strategic-restraint',
        name: 'Strategic Restraint',
        description: 'Never propose an alliance with the third AI nation (rightmost position).',
        bonusScore: 15,
        evaluate(gs) {
            const thirdNation = gs.aiNations[2];
            if (!thirdNation) return true;
            return !gs.moveHistory.some(
                m => m.actionId === 'alliance' && m.targetName === thirdNation.name
            );
        },
    },
    {
        id: 'economic-supremacy',
        name: 'Economic Supremacy',
        description: 'End the game with GDP at 85 or above.',
        bonusScore: 25,
        evaluate(gs) {
            return gs.stats.gdp >= 85;
        },
    },
    {
        id: 'iron-fist',
        name: 'Iron Fist',
        description: 'Impose sanctions on 2 or more different nations.',
        bonusScore: 18,
        evaluate(gs) {
            const sanctionedTargets = new Set(
                gs.moveHistory.filter(m => m.actionId === 'sanctions').map(m => m.targetName)
            );
            return sanctionedTargets.size >= 2;
        },
    },
    {
        id: 'peacekeeper',
        name: 'Peacekeeper',
        description: 'Impose no sanctions in the first 3 rounds.',
        bonusScore: 15,
        evaluate(gs) {
            return !gs.moveHistory.some(m => m.actionId === 'sanctions' && m.round <= 3);
        },
    },
    {
        id: 'grand-coalition',
        name: 'Grand Coalition',
        description: 'End with at least 2 nations having allied relations (score >= 20).',
        bonusScore: 22,
        evaluate(gs) {
            const alliedCount = Object.values(gs.relations).filter(score => score >= 20).length;
            return alliedCount >= 2;
        },
    },
    {
        id: 'military-supremacy',
        name: 'Military Supremacy',
        description: 'End the game with Military strength above 80.',
        bonusScore: 20,
        evaluate(gs) {
            return gs.stats.military > 80;
        },
    },
    {
        id: 'fortress-nation',
        name: 'Fortress Nation',
        description: 'Never propose a formal alliance with any nation.',
        bonusScore: 25,
        evaluate(gs) {
            return !gs.moveHistory.some(m => m.actionId === 'alliance');
        },
    },
    {
        id: 'trade-diplomat',
        name: 'Trade Diplomat',
        description: 'Propose a trade deal to every AI nation at least once.',
        bonusScore: 20,
        evaluate(gs) {
            const tradedTargets = new Set(
                gs.moveHistory.filter(m => m.actionId === 'trade').map(m => m.targetName)
            );
            return gs.aiNations.every(nation => tradedTargets.has(nation.name));
        },
    },
    {
        id: 'balanced-power',
        name: 'Balanced Power',
        description: 'End the game with all three stats (GDP, Military, Approval) above 60.',
        bonusScore: 18,
        evaluate(gs) {
            return gs.stats.gdp > 60 && gs.stats.military > 60 && gs.stats.approval > 60;
        },
    },
];

// ============================================================
// WORLD_EVENTS — drawn randomly during the game
// immediateEffect: applied to player stats immediately on draw.
// cascadeRule: ongoing modifier (null if no cascade).
//   cascadeRule.type must be one of:
//     'trade_gdp_multiplier' | 'military_multiplier' | 'alliance_rel_multiplier' |
//     'sanctions_rel_multiplier' | 'global_multiplier' | 'sanctions_retaliation' |
//     'ai_objective_aware'
//   cascadeRule.roundsRemaining: rounds left (-1 = permanent)
// ============================================================

const WORLD_EVENTS = [
    {
        id: 'global-recession',
        name: 'Global Recession',
        flavorText: 'Financial markets collapse as synchronized growth stalls worldwide.',
        immediateEffect: { gdp: -5, military: 0, approval: -3, allRelations: 0 },
        cascadeRule: {
            description: 'Trade GDP \xd7\xbd',
            longDesc: 'Trade Deal GDP bonuses halved for the remainder of the game.',
            type: 'trade_gdp_multiplier',
            value: 0.5,
            roundsRemaining: -1,
        },
        logMessage: 'Global recession: Trade GDP halved permanently.',
    },
    {
        id: 'arms-race',
        name: 'Arms Race Escalation',
        flavorText: 'Major powers accelerate weapons programs. Military posturing yields greater results but strains public trust.',
        immediateEffect: { gdp: -3, military: 8, approval: -4, allRelations: -10 },
        cascadeRule: {
            description: 'Military \xd72',
            longDesc: 'Military actions yield double effect for 2 rounds; Approval costs increased 50%.',
            type: 'military_multiplier',
            value: 2,
            roundsRemaining: 2,
            approvalCostMultiplier: 1.5,
        },
        logMessage: 'Arms race: Military effects doubled for 2 rounds, approval costs up 50%.',
    },
    {
        id: 'diplomatic-summit',
        name: 'Diplomatic Summit',
        flavorText: 'World leaders convene in emergency session. Alliance proposals carry unprecedented diplomatic weight.',
        immediateEffect: { gdp: 0, military: 0, approval: 5, allRelations: 5 },
        cascadeRule: {
            description: 'Alliance REL \xd73',
            longDesc: 'Alliance proposals yield triple relationship gains this round.',
            type: 'alliance_rel_multiplier',
            value: 3,
            roundsRemaining: 1,
        },
        logMessage: 'Diplomatic summit: Alliance relationship gains tripled this round.',
    },
    {
        id: 'sanctions-blowback',
        name: 'Sanctions Blowback',
        flavorText: 'International courts rule against unilateral coercion. Nations now respond in kind.',
        immediateEffect: { gdp: 0, military: 0, approval: -2, allRelations: 0 },
        cascadeRule: {
            description: 'Sanction Retaliate',
            longDesc: 'Any nation you sanction this round will automatically sanction you back next round.',
            type: 'sanctions_retaliation',
            value: 1,
            roundsRemaining: 1,
        },
        logMessage: 'Sanctions blowback: Sanctioned nations will retaliate next round.',
    },
    {
        id: 'intelligence-leak',
        name: 'Intelligence Leak',
        flavorText: 'Classified diplomatic cables exposed. AI nations adapt their strategies accordingly.',
        immediateEffect: { gdp: 0, military: -4, approval: -3, allRelations: -5 },
        cascadeRule: {
            description: 'AI Objective Aware',
            longDesc: 'AI nations are aware of your strategic objective this round.',
            type: 'ai_objective_aware',
            value: 1,
            roundsRemaining: 1,
        },
        logMessage: 'Intelligence leak: AI nations factor in your objective for 1 round.',
    },
    {
        id: 'energy-crisis',
        name: 'Energy Crisis',
        flavorText: 'Supply disruptions send energy prices surging. Economic interdependence becomes a liability.',
        immediateEffect: { gdp: -8, military: 0, approval: -4, allRelations: 0 },
        cascadeRule: null,
        logMessage: 'Energy crisis: GDP−8, Approval−4.',
    },
    {
        id: 'peace-dividend',
        name: 'Peace Dividend',
        flavorText: 'Unexpected de-escalation creates openings for diplomatic breakthroughs and goodwill.',
        immediateEffect: { gdp: 5, military: 0, approval: 6, allRelations: 12 },
        cascadeRule: {
            description: 'Sanctions REL \xd7\xbd',
            longDesc: 'Sanctions deal half the normal relationship damage this round.',
            type: 'sanctions_rel_multiplier',
            value: 0.5,
            roundsRemaining: 1,
        },
        logMessage: 'Peace dividend: Relations+12, Approval+6, sanctions less damaging this round.',
    },
    {
        id: 'proxy-conflict',
        name: 'Proxy Conflict',
        flavorText: 'A regional war stretches great power resources. Economic alternatives gain premium value.',
        immediateEffect: { gdp: -3, military: -6, approval: -5, allRelations: -8 },
        cascadeRule: {
            description: 'Trade GDP \xd71.5',
            longDesc: 'Trade deals yield 50% more GDP for the next 2 rounds.',
            type: 'trade_gdp_multiplier',
            value: 1.5,
            roundsRemaining: 2,
        },
        logMessage: 'Proxy conflict: Trade GDP boosted \xd71.5 for 2 rounds.',
    },
    {
        id: 'tech-breakthrough',
        name: 'Technology Breakthrough',
        flavorText: 'Dual-use innovation transforms both economic and military calculations simultaneously.',
        immediateEffect: { gdp: 6, military: 4, approval: 3, allRelations: 0 },
        cascadeRule: {
            description: 'All Effects \xd71.2',
            longDesc: 'All stat effects amplified by 20% this round.',
            type: 'global_multiplier',
            value: 1.2,
            roundsRemaining: 1,
        },
        logMessage: 'Tech breakthrough: All stat effects +20% this round.',
    },
    {
        id: 'cyber-warfare',
        name: 'Cyber Warfare Campaign',
        flavorText: 'Critical infrastructure attacks erode trust across the board. Alliance-building becomes harder.',
        immediateEffect: { gdp: -4, military: -5, approval: -3, allRelations: -10 },
        cascadeRule: {
            description: 'Alliance REL \xd70.7',
            longDesc: 'Alliance proposals yield 30% less relationship gain for 2 rounds.',
            type: 'alliance_rel_multiplier',
            value: 0.7,
            roundsRemaining: 2,
        },
        logMessage: 'Cyber warfare: Alliance relationship gains reduced 30% for 2 rounds.',
    },
];

// What non-targeted AI nations do to the player automatically each round
const AI_AUTO_ACTIONS = {
    'aggressive-expansionist': {
        allied:   { gdp: +2,  military: +6,  approval: +2,  message: 'conducted joint military exercises, reinforcing your combined defensive posture' },
        friendly: { gdp: 0,   military: +3,  approval: 0,   message: 'shared intelligence briefings on regional threats through secure channels' },
        neutral:  { gdp: 0,   military: 0,   approval: 0,   message: 'maintained watchful silence, neither provoking nor cooperating' },
        cold:     { gdp: -3,  military: -4,  approval: -2,  message: 'initiated covert pressure operations along your contested border zones' },
        hostile:  { gdp: -5,  military: -9,  approval: -5,  message: 'deployed forces in a deliberate show of strength near your territorial boundaries' },
    },
    'economic-pragmatist': {
        allied:   { gdp: +9,  military: 0,   approval: +4,  message: 'fast-tracked preferential trade agreements that boosted your economic indicators' },
        friendly: { gdp: +4,  military: 0,   approval: +2,  message: 'opened new market channels for your exports through bilateral negotiations' },
        neutral:  { gdp: 0,   military: 0,   approval: 0,   message: 'pursued their own economic interests without reference to yours' },
        cold:     { gdp: -5,  military: 0,   approval: -3,  message: 'imposed quiet trade barriers, redirecting commerce away from your markets' },
        hostile:  { gdp: -9,  military: 0,   approval: -5,  message: 'organized a multilateral economic bloc explicitly designed to isolate your nation' },
    },
    'isolationist-hardliner': {
        allied:   { gdp: +2,  military: +2,  approval: +3,  message: 'shared strategic reserves through unofficial channels as a quiet gesture of goodwill' },
        friendly: { gdp: +1,  military: +1,  approval: +1,  message: 'sent positive diplomatic signals through carefully unofficial channels' },
        neutral:  { gdp: 0,   military: 0,   approval: 0,   message: 'remained in complete diplomatic silence, as is their custom' },
        cold:     { gdp: -2,  military: +2,  approval: -1,  message: 'increased border surveillance and restricted entry of your nationals' },
        hostile:  { gdp: -3,  military: +4,  approval: -2,  message: 'severed all remaining diplomatic channels and retreated entirely behind their borders' },
    },
    'opportunistic-neutral': {
        allied:   { gdp: +5,  military: +2,  approval: +3,  message: 'provided useful intelligence briefings — for now, their interests appear to align with yours' },
        friendly: { gdp: +3,  military: 0,   approval: +2,  message: 'extended cooperation that, coincidentally, benefits them equally' },
        neutral:  { gdp: 0,   military: 0,   approval: -1,  message: 'watched the situation carefully and made no firm commitments' },
        cold:     { gdp: -5,  military: -2,  approval: -3,  message: 'quietly transmitted sensitive information about your positions to competing powers' },
        hostile:  { gdp: -7,  military: -5,  approval: -5,  message: 'sold detailed intelligence on your strategic vulnerabilities to your principal rivals' },
    },
};

// ============================================================
// ANALYSIS_DATABASE — Offline fallback for post-game analysis
// ============================================================

const ANALYSIS_DATABASE = {

    PLAYSTYLE_PROFILES: {
        aggressive: {
            title:    'Warmonger',
            opening:  'This representative pursued an overtly coercive diplomatic strategy, relying on economic pressure and punitive sanctions as the primary instruments of statecraft.',
            tendency: 'The pattern of repeated punitive measures signals a preference for dominance over accommodation, yielding short-term leverage at the sustained cost of regional goodwill.',
        },
        diplomatic: {
            title:    'Statesman',
            opening:  'This representative demonstrated a consistent commitment to multilateral engagement, prioritizing formal alliance structures over unilateral coercive action.',
            tendency: 'The sustained investment in alliance-building reflects an understanding that long-term stability requires reciprocal security guarantees rather than compellence.',
        },
        mercantile: {
            title:    'Merchant',
            opening:  'This representative conducted their term largely as a commercial exercise, subordinating geopolitical calculation to the logic of bilateral economic exchange.',
            tendency: 'The repeated deployment of trade mechanisms as the primary instrument reflects a calculated belief that economic interdependence generates more durable influence than political arrangement.',
        },
        balanced: {
            title:    'Pragmatist',
            opening:  'This representative adopted an adaptive, doctrine-light posture — rotating between coercive, cooperative, and commercial instruments according to situational demands.',
            tendency: 'The measured distribution of action types across the term indicates flexibility rather than rigid doctrine, an approach that limits both maximum risk and maximum gain.',
        },
        erratic: {
            title:    'Opportunist',
            opening:  'This representative exhibited an unstable diplomatic pattern, shifting between incompatible strategic orientations without establishing a coherent operational doctrine.',
            tendency: 'Counterpart nations found this unpredictability difficult to exploit but equally difficult to trust, producing a term defined by ambiguity rather than deliberate strategic positioning.',
        },
    },

    OUTCOME_COMMENTARY: {
        elite:   'The final performance assessment is exceptional — this operative achieved outcomes that few representatives in equivalent circumstances sustain across a full diplomatic term.',
        strong:  'The overall result is above-average, indicating effective resource management and generally sound judgment in the selection of targets and diplomatic instruments.',
        average: 'Final indicators land within the expected range for a representative of this configuration, suggesting competent but unremarkable execution of the available action set.',
        weak:    'The cumulative outcome falls below threshold benchmarks, indicating that strategic miscalculations compounded across rounds without sufficient corrective adjustment.',
        failure: 'The terminal assessment is unsatisfactory — indicators collapsed to a level that would, in operational context, warrant a full review of representation doctrine.',
    },

    STAT_COMMENTARY: {
        gdp_high:       'maintaining strong economic output throughout',
        gdp_low:        'allowing GDP indicators to deteriorate to operationally concerning levels',
        military_high:  'sustaining an elevated military posture across the full term',
        military_low:   'permitting military readiness to erode to a degree that reduced deterrent credibility',
        approval_high:  'retaining robust domestic approval ratings throughout',
        approval_low:   'absorbing substantial domestic political costs in the process',
    },

    RELATION_COMMENTARY: {
        all_allied:     'The final diplomatic footprint is notably cooperative — all three counterpart nations closed the term in an allied posture, a result consistent with either skilled relationship management or favorable initial conditions.',
        mostly_allied:  'The majority of counterpart nations ended the term in a positive alignment, suggesting that this representative\'s approach succeeded in building net diplomatic capital despite intermittent friction.',
        mixed:          'The final relationship map is fragmented — some nations were cultivated effectively while others closed in hostility, a pattern consistent with selective rather than comprehensive engagement.',
        mostly_hostile: 'Most counterpart nations closed the term in an adversarial posture, raising the question of whether the strategic costs of this approach were adequately modeled in advance.',
        all_hostile:    'All three counterpart nations ended the term in open hostility — a result indicating either deliberate antagonism as doctrine or a catastrophic failure of diplomatic calibration.',
    },

    OBJECTIVE_COMMENTARY: {
        completed: 'Completion of the assigned secret objective confirms that this representative maintained awareness of higher-order strategic requirements even under tactical pressure.',
        failed:    'Failure to complete the secret objective suggests that immediate tactical demands displaced longer-term strategic prioritization during the term.',
    },
};
