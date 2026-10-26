'use strict';
/* KalMydas PERSO : lecture sur Base de tout ce que Kal Mydas détient pour toi (lecture seule, aucune clé).
   Trois blocs, chacun avec ce qui a été mis, ce que ça vaut aujourd'hui, et le gain ou la perte :
   1. Stratégies (USDC) : userDeposited et userShares x sharePrice, comme le portefeuille de home.
   2. KAL dans l'app (verrouillé, mis en jeu, gagné à réclamer) : chaque KAL envoyé vers l'app ou revenu de l'app est lu dans
      l'historique des transferts et valorisé au prix du KalSwap AU BLOC du transfert.
   3. Liquidité KAL/USDC : chaque ajout et retrait, KAL et USDC, valorisés au prix du bloc.
   Le KAL acheté puis gardé dans le portefeuille n'est pas dans l'app : il n'est pas compté.
   Le KAL gagné (frappé pour toi ou réclamé) est un KAL sorti de l'app : il reste du gain, même remis ensuite en jeu.
   Adresses : 04_APPLICATIONS/00_SOURCE_COMMUNE_frontend/src/lib/addresses.ts. On n'en retire jamais une génération. */

const CHAIN_POOLS = [
  ['V5.2.2', { HORIZON: '0x6bDdFAA9Fe728bEee4A14FD64F7C770490A42654', VALKYRIE: '0xAb1825cB888c88a283518905f7981C3b2E158bD8', REVOLUTION: '0xB502e605804d03c45Ea8a7f73814Fd3efcB2975d', TREASURY: '0xeCf3c5963B3514714F9d6bDC3F481EB8e4007Aa9', ORION: '0x04495A5F602fad117cC39806603c95D458De405E', GENESIS: '0x9455fFC22D84031BAf05f3091DB4FF6e48722F77' }],
  ['V5.2.0', { HORIZON: '0xeC0F2B417741BF827d7ead53f0a9722847b6aB2d', VALKYRIE: '0xC04A2FbE7816Db5bF33b45D25c0F813b2BF67717', REVOLUTION: '0x887e1787684879Ab4Aa3544C4eAeA394E8da8dBf', TREASURY: '0xf5aC77495227741CeB696d43Cd0fD4Ed83F73Bf8', ORION: '0x9b87C7075ca523a160F6e9657dDEedb263CFa3c2', GENESIS: '0x7393819B67A4f70C307831B114Ca5f5e224bebF1' }],
  ['V5.1.4', { HORIZON: '0x96869F08F5B5C52664c9620269394eFF4efd065b', VALKYRIE: '0x6dd6e7A6154293b22Dcd5d07d8f61F446646B15d', REVOLUTION: '0x9A9990fdFf702f7aEd10f873eeD2baB60e493038', TREASURY: '0x03FEC25393C38cC5DE1F2D2DB620b8478cAC4Ae0', ORION: '0x55F8D85749EA9C374b3aBFaEF7B07429546F6A97' }],
  ['V5.1.3', { HORIZON: '0x81bBaB24ca0c8Ff6319BDf4590d6FF783bD03925', VALKYRIE: '0xa768EcBCb45EAffd2d106D6A884bE0495ddade84', REVOLUTION: '0xA7d2E837CCeDc3863D4Fe03DF830dcDf3dA30823', TREASURY: '0x04F2EA01ce0935058dc6779F30Fb59b6E219675B', ORION: '0xE33fc505d195DD98103D7C6a4D369dE4f3d91aAD' }],
  ['V1', { HORIZON: '0xe1Cd26c4017cbb66A1Ad6BAc95C3CDE67C24FBE3', VALKYRIE: '0x375CBbABC481Fb7bEb842D201E57A522e0FcF35B', REVOLUTION: '0x77Cd662165434C0Ab60ded459221f818EF31B58c', TREASURY: '0xd29Ef132b730802931FfBC7fAF0d5c0Ab12813c4', ORION: '0x4ec08709EB7F2251C4C8bf4867C2C7B9CdFC12Fb' }]
];
// Hôtes éprouvés (RESSOURCES/LECTURE_ONCHAIN_BASE_SANS_INDEXEUR.md, relu le 2026-10-22). mainnet.base.org peut rendre 0x en silence : en lecture courante toute réponse vide est rejetée.
const CHAIN_RPC = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org', 'https://base.gateway.tenderly.co'];
const CHAIN_ARCHIVE = ['https://mainnet.base.org', 'https://base.drpc.org', 'https://base.gateway.tenderly.co']; // publicnode refuse l'archive sans jeton
const SEL = { shares: '0xde69b3aa', deposited: '0x8092be4a', price: '0x87269729', bal: '0x70a08231', lock: '0x15056b54', kalUsers: '0x77149195', pendRew: '0xaa38e133', pendPool: '0x1640adf0', cfg: '0x678b2567', lpUser: '0xdbf30b01', supply: '0x18160ddd', resKal: '0xcb0131d9', resUsdc: '0xc87b502e', kalPrice: '0xeb91d37e' };
const KAL_TOKEN = '0xe99556D5594faf533fcB346A8a9B11259D29afA8', USDC_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', VEKAL = '0x58CfcB5A67Aac6255cA13771EbdCFF45bAd5d605';
// Marchés KAL/USDC : le jeton de liquidité est le contrat du marché lui-même.
const MARKETS = [{ name: 'Marché en service', addr: '0x3315E6E788E2B30aF8f4c35124695E60D510c31B' }, { name: 'Marché neuf', addr: '0x1FaC3B6a11C441Dd1535deB4c1140a7D01fB8E98' }];
const KALSWAP_V1 = '0x94872D612C9572cB9CC06239ceFF52108db52CBC', KAL_ROUTER = '0xfe8bb77Bc80f5295889fac1D763c8833c3d940b1';
const LR_LIST = ['0x590f7d2ba77ADac6fC1e3cc2df16781989919529', '0x116BBb2333B482cAB15ae10620E7671D6231434e', '0xF392A8F1B6c85f607F988B44EcAE2B4d652585f5', '0x43092cD5A8B78613F619F10b274162b84B751247', '0x24363E74E8ADBaCF5A8aB9D750E7e2b81640472C'];
const PR_LIST = ['0x2F437493a8899bBd3B7dB41597d9f2695B7070c9', '0x5dEE301aD9290DC5BAFa8cC6F6e359bDDF5356ea', '0xEb9110f4885451B84546C809f26afd71a016FA19', '0x77feeA49fd83A635fa3474e23D89534Cb1b1b809'];
// Contrats de l'app avec lesquels le KAL entre ou sort. Achats (prévente, courbe, marché) et échanges n'en font pas partie.
const APP_SET = new Set([VEKAL, ...LR_LIST, ...PR_LIST, '0x8E5176e0B020C3a8D33425E2B5b62e12EB39f11d', '0x09BE9fEBF7853Ce9e549d051D1C6a40d6C8F1848', '0xa7Eaf67D7A4ca73190550c1aF5F82e65d3545508'].map(a => a.toLowerCase()));
const MARKET_SET = new Set([...MARKETS.map(m => m.addr), KALSWAP_V1, KAL_ROUTER].map(a => a.toLowerCase()));
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a);
const arg = a => a.toLowerCase().replace('0x', '').padStart(64, '0');
const num256 = n => n.toString(16).padStart(64, '0');
const W = (hex, i = 0) => BigInt('0x' + hex.slice(2 + 64 * i, 66 + 64 * i));
const ZERO = '0x' + '0'.repeat(64);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PRICE_MIN = 0.0005; // en dessous, le marché lu est vide (l'ancien marché V1 vaut 0,000001)

/* ----- lecture RPC par lots, avec repli d'hôte en hôte ----- */
async function callHost(url, calls, lenient) {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: c.to, data: c.data }, c.block || 'latest'] }));
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  let arr; try { arr = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (!Array.isArray(arr)) throw new Error(arr && arr.error ? arr.error.message : `HTTP ${res.status}`);
  const out = new Array(calls.length);
  for (const r of arr) {
    if (r.error) { // un revert (contrat sans cette fonction) vaut zéro ; toute autre erreur est celle de l'hôte
      if (/revert/i.test(r.error.message || '')) { out[r.id] = ZERO; continue; }
      throw new Error(r.error.message || 'erreur');
    }
    if (typeof r.result !== 'string') throw new Error('réponse vide');
    if (r.result.length < 66) { if (lenient) { out[r.id] = ZERO; continue; } throw new Error('réponse vide'); } // 0x : un hôte qui limite en silence, ou pas de code à ce bloc
    out[r.id] = r.result;
  }
  if (out.some(v => v === undefined)) throw new Error('réponse incomplète');
  return out;
}
async function rpcChunk(calls, lenient, hosts = CHAIN_RPC) {
  const errs = [];
  for (const url of hosts) {
    try { return await callHost(url, calls, lenient); } catch (e) {
      if (/batch/i.test(e.message) && calls.length > 3) { // plafond de lot de l'hôte : on passe par lots de trois
        try { const out = []; for (let i = 0; i < calls.length; i += 3) out.push(...await callHost(url, calls.slice(i, i + 3), lenient)); return out; } catch (e2) { errs.push(`${url.replace('https://', '')}: ${e2.message}`); continue; }
      }
      errs.push(`${url.replace('https://', '')}: ${e.message}`);
    }
  }
  throw new Error(`aucun hôte n'a répondu (${errs.join(' ; ')})`);
}
async function rpcMany(calls, lenient, hosts) {
  const res = [];
  for (let i = 0; i < calls.length; i += 10) res.push(...await rpcChunk(calls.slice(i, i + 10), lenient, hosts));
  return res;
}

/* ----- 1. état d'aujourd'hui ----- */
async function readKal(wallets) {
  const pools = CHAIN_POOLS.flatMap(([gen, m]) => Object.entries(m).map(([name, addr]) => ({ gen, name, addr })));
  const recent = pools.filter(p => p.gen === 'V5.2.2' || p.gen === 'V5.2.0' || p.gen === 'V5.1.4'); // pools qui peuvent encore porter des récompenses KAL
  const calls = [];
  const add = (to, data) => { calls.push({ to, data }); return calls.length - 1; };
  const priceIdx = pools.map(p => add(p.addr, SEL.price));
  const mk = MARKETS.map(m => ({ ...m, price: add(m.addr, SEL.kalPrice), supply: add(m.addr, SEL.supply), resKal: add(m.addr, SEL.resKal), resUsdc: add(m.addr, SEL.resUsdc) }));
  const cfgIdx = LR_LIST.map(lr => [0, 1, 2, 3, 4].map(s => add(lr, SEL.cfg + num256(s))));
  const wIdx = wallets.map(w => {
    const o = { w, kal: add(KAL_TOKEN, SEL.bal + arg(w)), lock: add(VEKAL, SEL.lock + arg(w)), lpw: mk.map(m => add(m.addr, SEL.bal + arg(w))), shares: [], dep: [], ku: [], pr: [], pp: [] };
    pools.forEach(p => { o.shares.push(add(p.addr, SEL.shares + arg(w))); o.dep.push(add(p.addr, SEL.deposited + arg(w))); });
    LR_LIST.forEach(lr => { o.ku.push(add(lr, SEL.kalUsers + arg(w))); o.pr.push(add(lr, SEL.pendRew + arg(w))); });
    PR_LIST.forEach(pr => recent.forEach(p => o.pp.push(add(pr, SEL.pendPool + arg(w) + arg(p.addr)))));
    return o;
  });
  const res = await rpcMany(calls);
  mk.forEach(m => { m.p = Number(W(res[m.price])) / 1e6; m.sup = Number(W(res[m.supply])) / 1e18; m.rk = Number(W(res[m.resKal])) / 1e18; m.ru = Number(W(res[m.resUsdc])) / 1e6; m.lpKal = 0; m.lpUsdc = 0; });
  const kalPrice = (mk.find(m => m.p > PRICE_MIN) || mk[0]).p;
  // Numéro d'emplacement de chaque marché dans chaque contrat de récompenses : lu à partir du jeton, jamais écrit en dur.
  const slot = cfgIdx.map(row => mk.map(m => { const s = row.findIndex(i => W(res[i]) === BigInt(m.addr)); return s < 0 ? null : s; }));
  const calls2 = [];
  wIdx.forEach(o => { o.lp = mk.map((m, mi) => LR_LIST.map((lr, li) => (slot[li][mi] === null ? null : (calls2.push({ to: lr, data: SEL.lpUser + num256(slot[li][mi]) + arg(o.w) }), calls2.length - 1)))); });
  const res2 = calls2.length ? await rpcMany(calls2) : [];

  const pos = new Map(), kal = { wallet: 0, locked: 0, staked: 0, pending: 0 };
  wIdx.forEach(o => {
    pools.forEach((p, i) => {
      const shares = Number(W(res[o.shares[i]])) / 1e6, dep = Number(W(res[o.dep[i]])) / 1e6, price = Number(W(res[priceIdx[i]])) / 1e6;
      if (shares <= 0 && dep <= 0) return;
      const k = `${p.gen}|${p.name}`, x = pos.get(k) || { gen: p.gen, name: p.name, deposited: 0, value: 0 };
      x.deposited += dep; x.value += shares * price; pos.set(k, x);
    });
    kal.wallet += Number(W(res[o.kal])) / 1e18;
    kal.locked += Number(W(res[o.lock])) / 1e18; // premier mot de getLockDetails : le KAL verrouillé
    o.ku.forEach(i => { kal.staked += Number(W(res[i])) / 1e18; });
    o.pr.forEach(i => { kal.pending += Number(W(res[i])) / 1e18; });
    o.pp.forEach(i => { kal.pending += Number(W(res[i])) / 1e18; });
    mk.forEach((m, mi) => {
      const lpTokens = Number(W(res[o.lpw[mi]])) / 1e18 + sum(o.lp[mi].filter(i => i !== null), i => Number(W(res2[i])) / 1e18);
      if (m.sup > 0) { m.lpKal += (lpTokens / m.sup) * m.rk; m.lpUsdc += (lpTokens / m.sup) * m.ru; }
    });
  });
  const positions = [...pos.values()];
  const strat = { net: sum(positions, x => x.deposited), now: sum(positions, x => x.value) };
  const kalIn = kal.locked + kal.staked + kal.pending;
  const lpKal = sum(mk, m => m.lpKal), lpUsdc = sum(mk, m => m.lpUsdc);
  return { positions, strat, kal, kalPrice, kalInApp: kalIn, kalNow: kalIn * kalPrice, lp: { kal: lpKal, usdc: lpUsdc, now: lpKal * kalPrice + lpUsdc } };
}

/* ----- 2. historique : transferts lus chez Blockscout, valorisés au prix du bloc ----- */
const BLOCKSCOUT = 'https://base.blockscout.com/api';
async function tokenTx(w, token) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    let j;
    await sleep(1300); // un appel toutes les 1,3 s : Blockscout coupe au-delà d'un petit débit
    for (let t = 0; t < 6; t++) { // Blockscout limite le débit : on attend et on reprend
      try { j = await (await fetch(`${BLOCKSCOUT}?module=account&action=tokentx&address=${w}&contractaddress=${token}&sort=asc&page=${page}&offset=1000`)).json(); } catch (e) { j = null; }
      if (j && !/too many|rate/i.test(j.message || '')) break;
      if (t === 5) throw new Error(j ? 'Blockscout limite le débit, réessaie dans une minute' : 'Blockscout ne répond pas');
      await sleep(2500 * (t + 1));
    }
    if (!Array.isArray(j.result)) { if (/no (transactions|tokens)/i.test(j.message || '')) break; throw new Error(`Blockscout : ${j.message || 'réponse inattendue'}`); }
    out.push(...j.result);
    if (j.result.length < 1000) break;
  }
  return out;
}
async function pricesAt(blocks, cache) { // prix du KAL à chaque bloc, par lecture d'archive ; mis en mémoire dans le coffre
  const need = [...new Set(blocks)].filter(b => !(b in cache));
  for (const addr of [MARKETS[0].addr, MARKETS[1].addr, KALSWAP_V1]) { // marché en service, marché neuf, puis l'ancien marché pour les premières semaines
    const todo = need.filter(b => !(cache[b] > 0));
    if (!todo.length) break;
    const res = await rpcMany(todo.map(b => ({ to: addr, data: SEL.kalPrice, block: '0x' + b.toString(16) })), true, CHAIN_ARCHIVE);
    todo.forEach((b, i) => { const p = Number(W(res[i])) / 1e6; if (p > PRICE_MIN) cache[b] = p; });
  }
  need.forEach(b => { if (!(cache[b] > 0)) cache[b] = 0; });
}
async function readLedger(wallets, cache, onStep) {
  const T = [];
  for (const w of wallets) {
    const me = w.toLowerCase();
    for (const [tok, addr, dec] of [['KAL', KAL_TOKEN, 18], ['USDC', USDC_TOKEN, 6], ...MARKETS.map((m, i) => ['LP', m.addr, 18])]) {
      if (onStep) onStep(`historique ${tok}`);
      for (const t of await tokenTx(w, addr)) {
        const out = t.from.toLowerCase() === me;
        T.push({ tok, h: t.hash, blk: Number(t.blockNumber), ts: Number(t.timeStamp), dir: out ? 'out' : 'in', cp: (out ? t.to : t.from).toLowerCase(), v: Number(BigInt(t.value)) / 10 ** dec });
      }
    }
  }
  const lpTx = new Map(); // hash -> 'add' | 'remove' (mint ou burn du jeton de liquidité chez le portefeuille)
  T.filter(t => t.tok === 'LP' && t.cp === ZERO_ADDR).forEach(t => lpTx.set(t.h, t.dir === 'in' ? 'add' : 'remove'));
  const kalFlows = [], lpFlows = new Map();
  for (const t of T) {
    if (t.v <= 0) continue;
    if (t.tok === 'KAL') {
      if (APP_SET.has(t.cp) || t.cp === ZERO_ADDR) {
        if (t.dir === 'out' && t.cp !== ZERO_ADDR) kalFlows.push({ way: 'in', qty: t.v, blk: t.blk, ts: t.ts, h: t.h });
        if (t.dir === 'in') kalFlows.push({ way: 'out', qty: t.v, blk: t.blk, ts: t.ts, h: t.h, minted: t.cp === ZERO_ADDR });
      } else if (MARKET_SET.has(t.cp) && lpTx.has(t.h) && ((lpTx.get(t.h) === 'add' && t.dir === 'out') || (lpTx.get(t.h) === 'remove' && t.dir === 'in'))) {
        const f = lpFlows.get(t.h) || { way: lpTx.get(t.h) === 'add' ? 'in' : 'out', kal: 0, usdc: 0, blk: t.blk, ts: t.ts, h: t.h }; f.kal += t.v; lpFlows.set(t.h, f);
      }
    } else if (t.tok === 'USDC' && MARKET_SET.has(t.cp) && lpTx.has(t.h) && ((lpTx.get(t.h) === 'add' && t.dir === 'out') || (lpTx.get(t.h) === 'remove' && t.dir === 'in'))) {
      const f = lpFlows.get(t.h) || { way: lpTx.get(t.h) === 'add' ? 'in' : 'out', kal: 0, usdc: 0, blk: t.blk, ts: t.ts, h: t.h }; f.usdc += t.v; lpFlows.set(t.h, f);
    }
  }
  const lpList = [...lpFlows.values()];
  if (onStep) onStep('prix du KAL aux dates des transferts');
  await pricesAt([...kalFlows.map(f => f.blk), ...lpList.map(f => f.blk)], cache);
  const L = { kal: { inQty: 0, inUsd: 0, outQty: 0, outUsd: 0, mintedQty: 0, n: 0 }, lp: { inUsd: 0, outUsd: 0, inKal: 0, inUsdc: 0, outKal: 0, outUsdc: 0, n: 0 }, skipped: 0, first: null };
  const seen = ts => { if (L.first === null || ts < L.first) L.first = ts; };
  for (const f of kalFlows) {
    const p = cache[f.blk]; if (!(p > 0)) { L.skipped++; continue; }
    seen(f.ts); L.kal.n++;
    if (f.way === 'in') { L.kal.inQty += f.qty; L.kal.inUsd += f.qty * p; } else { L.kal.outQty += f.qty; L.kal.outUsd += f.qty * p; if (f.minted) L.kal.mintedQty += f.qty; }
  }
  for (const f of lpList) {
    const p = cache[f.blk]; if (!(p > 0)) { L.skipped++; continue; }
    seen(f.ts); L.lp.n++;
    const usd = f.kal * p + f.usdc;
    if (f.way === 'in') { L.lp.inUsd += usd; L.lp.inKal += f.kal; L.lp.inUsdc += f.usdc; } else { L.lp.outUsd += usd; L.lp.outKal += f.kal; L.lp.outUsdc += f.usdc; }
  }
  return L;
}

/* ----- branchement sur le panneau ----- */
const chainAcc = () => A().accounts.find(a => a.auto === 'chain');
let chainBusy = null;
// Blockscout gratuit : 10 appels par fenêtre d'environ 40 minutes. Une lecture d'historique coûte 4 appels par adresse : on la garde 30 minutes.
const LEDGER_TTL = 30 * 60 * 1000;
async function syncKal(silent, forceLedger) {
  const w = (STATE.settings.wallets || []).filter(isAddr);
  if (!w.length) { if (!silent) editWallets(); return; }
  if (chainBusy) return;
  chainBusy = 'lecture de l\'état actuel'; if (!silent) rerender();
  const step = s => { chainBusy = s; const el = document.getElementById('chain-step'); if (el) el.textContent = s; };
  try {
    const r = await readKal(w);
    let a = chainAcc();
    if (!a && !(r.strat.now + r.kalNow + r.lp.now > 0)) { if (!silent) toast('Rien trouvé pour ces adresses'); return; }
    STATE.chainCache = STATE.chainCache || { prices: {} };
    let ledger = null, ledgerError = null;
    const same = a && a.chain && a.chain.ledger && a.chain.walletsKey === w.join(',');
    if (same && !forceLedger && Date.now() - (a.chain.ledgerAt || 0) < LEDGER_TTL) { ledger = a.chain.ledger; }
    else { try { ledger = await readLedger(w, STATE.chainCache.prices, step); } catch (e) { ledgerError = e.message; ledger = same ? a.chain.ledger : null; } }
    if (!ledger) throw new Error(ledgerError || 'historique indisponible'); // sans historique, pas de gain à montrer : on ne fabrique pas un zéro
    const L = ledger || { kal: { inQty: 0, inUsd: 0, outQty: 0, outUsd: 0, mintedQty: 0, n: 0 }, lp: { inUsd: 0, outUsd: 0, inKal: 0, inUsdc: 0, outKal: 0, outUsdc: 0, n: 0 }, skipped: 0 };
    const blocks = {
      strat: { net: r.strat.net, now: r.strat.now },
      kal: { net: (L.kal.inUsd - L.kal.outUsd) + (L.lp.inUsd - L.lp.outUsd), now: r.kalNow + r.lp.now } // KAL et liquidité ensemble : les récompenses de la liquidité arrivent en KAL
    };
    const net = blocks.strat.net + blocks.kal.net, now = blocks.strat.now + blocks.kal.now;
    if (!a) { a = { id: uid(), name: 'Kal Mydas (lu sur Base)', type: 'kalmydas', cur: 'USDC', rate: 1, bal: 0, deposit: 0, note: 'Lu sur la chaîne. Règle le taux USDC vers CHF dans Modifier.', auto: 'chain' }; A().accounts.push(a); }
    a.bal = r2(now); a.deposit = r2(net); a.chain = { at: Date.now(), ...r, blocks, ledger: L, ledgerError, walletsKey: w.join(','), ledgerAt: ledgerError || !ledger ? (a.chain && a.chain.ledgerAt) || 0 : (same && !forceLedger && Date.now() - (a.chain.ledgerAt || 0) < LEDGER_TTL ? a.chain.ledgerAt : Date.now()) };
    snap(); save();
    if (!silent) toast(ledgerError ? `État lu, historique indisponible : ${ledgerError}` : 'Lu sur Base');
  } catch (e) { if (!silent) toast(`Lecture impossible : ${e.message}`); else console.warn('[Kal Mydas]', e.message); }
  finally { chainBusy = null; rerender(); }
}

const usd = n => `${fmtNum(n)} USDC`;
const sgn = n => (n > 0 ? '+' : '') + fmtNum(n);
const pctOf = (gain, net) => (net > 0.0001 ? ` (${gain >= 0 ? '+' : ''}${fmtPct((gain / net) * 100)})` : '');
function chainDetail() {
  if (chainBusy) return h('p', { class: 'muted' }, 'Lecture sur Base : ', h('span', { id: 'chain-step' }, chainBusy), '…');
  const ca = chainAcc(), c = ca && ca.chain;
  if (!c) return null;
  const line = (label, value, cls, sub) => h('div', { class: 'item' }, h('div', { class: 'grow' }, label, sub ? h('small', { class: 'muted' }, ` ${sub}`) : null), h('div', { class: `right ${cls || ''}` }, h('span', { class: 'amt' }, value)));
  const avg = (u, q) => (q > 0 ? `${(u / q).toFixed(5).replace('.', ',')} USDC` : '');
  const bloc = (title, rows, b) => {
    const gain = b.now - b.net;
    return h('div', { class: 'bloc' }, h('h4', null, title), h('div', { class: 'list' }, rows,
      line('Mis dedans moins ressorti', usd(b.net), '', b.net < 0 ? "négatif : tu as déjà repris plus que tu n'as mis" : ''),
      line("Valeur aujourd'hui", usd(b.now)),
      line('Gain ou perte', `${sgn(gain)} USDC${pctOf(gain, b.net)}`, gain >= 0 ? 'pos strong' : 'neg strong')));
  };
  const L = c.ledger, B = c.blocks, netAll = B.strat.net + B.kal.net, nowAll = B.strat.now + B.kal.now, gainAll = nowAll - netAll;
  return h('div', { class: 'detail' },
    c.ledgerError ? h('p', { class: 'neg' }, `Historique indisponible (${c.ledgerError}) : le KAL et la liquidité utilisent la dernière lecture connue.`) : null,
    h('p', { class: 'muted' }, `Prix du KAL aujourd'hui : ${c.kalPrice.toFixed(5).replace('.', ',')} USDC.`),
    bloc('Stratégies (USDC)', c.positions.map(p => line(`${p.name} ${p.gen}`, `${fmtNum(p.deposited)} → ${fmtNum(p.value)} USDC`)), B.strat),
    bloc('KAL et liquidité KAL/USDC', [
      line("KAL mis dans l'app", `${fmtNum(L.kal.inQty)} KAL`, '', L.kal.inQty ? `prix moyen ${avg(L.kal.inUsd, L.kal.inQty)}` : ''),
      line("KAL sorti de l'app (gagné, retiré)", `${fmtNum(L.kal.outQty)} KAL`, '', L.kal.outQty ? `prix moyen ${avg(L.kal.outUsd, L.kal.outQty)}` : ''),
      line('Liquidité ajoutée', `${fmtNum(L.lp.inKal)} KAL + ${fmtNum(L.lp.inUsdc)} USDC`, '', 'au prix du jour de chaque ajout'),
      line('Liquidité retirée', `${fmtNum(L.lp.outKal)} KAL + ${fmtNum(L.lp.outUsdc)} USDC`),
      line("KAL dans l'app maintenant", `${fmtNum(c.kalInApp)} KAL`, '', `${fmtNum(c.kal.locked)} verrouillé, ${fmtNum(c.kal.staked)} en jeu, ${fmtNum(c.kal.pending)} à réclamer`),
      line('Liquidité maintenant', `${fmtNum(c.lp.kal)} KAL + ${fmtNum(c.lp.usdc)} USDC`)], B.kal),
    h('div', { class: 'bloc total' }, h('h4', null, 'Tout ensemble'), h('div', { class: 'list' },
      line('Mis dedans moins ressorti', usd(netAll)), line("Valeur aujourd'hui", usd(nowAll)),
      line('Gain ou perte', `${sgn(gainAll)} USDC${pctOf(gainAll, netAll)}`, gainAll >= 0 ? 'pos strong' : 'neg strong'))),
    h('small', { class: 'muted' }, `Hors app, pas compté : ${fmtNum(c.kal.wallet)} KAL dans le portefeuille. `,
      L.skipped ? `${L.skipped} transfert(s) sans prix lisible, ignoré(s). ` : '', L.first ? `Historique lu depuis le ${shortDate(ymd(new Date(L.first * 1000)))}.` : ''));
}
function editWallets() {
  const t = h('textarea', { rows: 4, placeholder: '0x...  (une adresse par ligne)' });
  t.value = (STATE.settings.wallets || []).join('\n');
  modal('Mes adresses sur Base', h('div', { class: 'form' },
    field('Adresses des portefeuilles qui ont des dépôts', t, 'Adresses publiques seulement, jamais de clé ni de phrase secrète. La lecture passe par des services publics (RPC et Blockscout) qui voient ton adresse et ton IP. Si tu as déjà saisi un compte Kal Mydas à la main, supprime-le pour ne pas compter deux fois.')),
    [{ label: 'Enregistrer et lire', run: () => {
      const list = [...new Set(t.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
      if (list.some(a => !isAddr(a))) { toast("Une adresse n'est pas valide (0x puis 40 caractères)"); return false; }
      STATE.settings.wallets = list; save(); syncKal(false);
    } }]);
}
