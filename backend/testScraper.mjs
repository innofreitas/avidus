#!/usr/bin/env node
/**
 * testScraper.mjs — Diagnóstico completo dos scrapers (axios + cheerio + iconv-lite)
 *
 * Uso:
 *   node testScraper.mjs PETR4
 *   node testScraper.mjs VALE3 --verbose
 *   node testScraper.mjs ITUB4 --fonte=fundamentus
 *   node testScraper.mjs WEGE3 --verbose --fonte=statusinvest
 *
 * Flags:
 *   --verbose          Mostra o HTML bruto recebido (primeiros 4000 chars)
 *   --fonte=<nome>     Testa só uma fonte: investidor10 | fundamentus | statusinvest
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// ─── Args ─────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const TICKET  = (args.find(a => !a.startsWith('--')) ?? 'PETR4').toUpperCase().replace(/\.SA$/i, '');
const VERBOSE = args.includes('--verbose');
const FONTE   = args.find(a => a.startsWith('--fonte='))?.split('=')[1] ?? null;

const sep  = (s) => console.log('\n' + '─'.repeat(62) + `\n  ${s}\n` + '─'.repeat(62));
const ssep = (s) => console.log('\n' + '═'.repeat(62) + `\n  ${s}\n` + '═'.repeat(62));

ssep(`🔬  AVIDUS — Diagnóstico Scraper  |  Ticker: ${TICKET}  |  Fonte: ${FONTE ?? 'todas'}`);

// ─── HTTP ─────────────────────────────────────────────────────

const client = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Referer':         'https://www.google.com/',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua':        '"Chromium";v="122", "Not(A:Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-fetch-dest':   'document',
    'sec-fetch-mode':   'navigate',
    'sec-fetch-site':   'none',
  },
  maxRedirects: 5,
  decompress: true,
});

/** Busca HTML com encoding UTF-8 (investidor10, statusinvest) */
async function getHtml(url) {
  const t0 = Date.now();
  try {
    const res  = await client.get(url, { responseType: 'text' });
    const ms   = Date.now() - t0;
    const html = typeof res.data === 'string' ? res.data : String(res.data);
    console.log(`    ✅ HTTP ${res.status} | ${(html.length/1024).toFixed(1)} KB | ${ms}ms`);
    if (VERBOSE) {
      console.log(`\n    ── HTML RAW (primeiros 4000 chars) ──────────────────`);
      console.log(html.slice(0, 4000));
      console.log(`    ── fim do preview ───────────────────────────────────\n`);
    }
    return html;
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`    ❌ HTTP ${e?.response?.status ?? 'ERR'} | ${ms}ms | ${e.message}`);
    if (e?.response?.data) console.log(`    Body: ${String(e.response.data).slice(0, 200)}`);
    return null;
  }
}

/** Busca HTML com encoding ISO-8859-1 via iconv-lite (Fundamentus) */
async function getHtmlLatin1(url) {
  const t0 = Date.now();
  try {
    const res  = await client.get(url, { responseType: 'arraybuffer' });
    const ms   = Date.now() - t0;
    const html = iconv.decode(Buffer.from(res.data), 'iso-8859-1');
    console.log(`    ✅ HTTP ${res.status} | ${(html.length/1024).toFixed(1)} KB | ${ms}ms | ISO-8859-1`);
    if (VERBOSE) {
      console.log(`\n    ── HTML RAW decodificado (primeiros 4000 chars) ─────`);
      console.log(html.slice(0, 4000));
      console.log(`    ── fim do preview ───────────────────────────────────\n`);
    }
    return html;
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`    ❌ HTTP ${e?.response?.status ?? 'ERR'} | ${ms}ms | ${e.message}`);
    return null;
  }
}

// ─── Parse helpers ────────────────────────────────────────────

function parseNum(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'n/a') return null;
  const x = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isFinite(x) ? x : null;
}

function parsePct(raw) {
  const v = parseNum(String(raw ?? '').replace('%', ''));
  return v == null ? null : v / 100;
}

function fmtVal(v) {
  if (v == null) return '     null';
  return String(v.toFixed(4)).padStart(9);
}

// ─── INVESTIDOR10 ─────────────────────────────────────────────

async function testInvestidor10(ticket) {
  sep(`🏦  INVESTIDOR10  |  https://investidor10.com.br/acoes/${ticket}/`);
  const html = await getHtml(`https://investidor10.com.br/acoes/${ticket}/`);
  if (!html) return null;

  const $ = cheerio.load(html);

  // Diagnóstico de estruturas
  // console.log('\n    Estruturas encontradas:');
  // console.log(`      ._card.cotacao     : ${$('._card.cotacao').length > 0 ? '✅' : '❌'}`);
  // console.log(`      #table-indicators  : ${$('#table-indicators').length > 0 ? '✅' : '❌'}`);
  // console.log(`      ._card-title       : ${$('._card-title').length} elementos`);
  // console.log(`      .value             : ${$('.value').length} elementos`);

  if (VERBOSE) {
    console.log('\n    Todos os _card-title encontrados:');
    $('._card-title').each((_, el) => console.log(`      "${$(el).text().trim()}"`));
    console.log('\n    Bloco #table-indicators (primeiros 2000):');
    console.log($('#table-indicators').html()?.slice(0, 2000) ?? '(não encontrado)');
  }

  // Cotação
  const priceRaw = $('._card.cotacao .value, ._card.cotacao .val').first().text();
  const price    = parseNum(priceRaw.replace(/R\$\s?/i, ''));
  // console.log(`\n    Cotação raw: "${priceRaw}" → ${price}`);

  // Indicadores — pares de filhos (label, value) dentro de #table-indicators
  const I10_MAP = {
    'P/L':                     'pl',
    'P/VP':                    'pvp',
    'DIVIDEND YIELD':          'dy',
    'DY':                      'dy',
    'PAYOUT':                  'payout',
    'MARGEM LÍQUIDA':          'margemLiquida',
    'MARGEM LIQUIDA':          'margemLiquida',
    'ROE':                     'roe',
    'ROA':                     'roa',
    'LIQUIDEZ CORRENTE':       'liqCorrente',
    'LIQ. CORRENTE':           'liqCorrente',
    'DÍVIDA LÍQUIDA/EBITDA':   'dividaEbitda',
    'DÍVIDA LÍQUIDA / EBITDA': 'dividaEbitda',
  };
  const I10_PCT = new Set(['dy','payout','margemLiquida','roe','roa']);

  const tableIndicators = $('#table-indicators');
  // console.log(`\n    #table-indicators encontrado: ${tableIndicators.length > 0 ? '✅' : '❌'}`);

  // Log de TODOS os pares — útil para descobrir labels reais do site
  // console.log('\n    Todos os pares (label → value) em #table-indicators:');
  // let pairsFound = 0;
  // tableIndicators.find('div, span').each((_, element) => {
  //   const $el      = $(element);
  //   const children = $el.children();
  //   if (children.length < 2) return;
  //   // Remove sufixo " - TICKER" do label (ex: "DIVIDEND YIELD - PETR4")
  //   const label = children.eq(0).text().trim().replace(/\s*-\s*[A-Z0-9]{3,6}$/i, '').trim();
  //   const value = children.eq(1).text().trim();
  //   if (!label || !value || label === value || label.length >= 50) return;
  //   pairsFound++;
  //   const key    = I10_MAP[label.toUpperCase()];
  //   const mapped = key ? `→ [${key}]` : '(não mapeado)';
  //   console.log(`      "${label.padEnd(28)}" = "${value}" ${mapped}`);
  // });
  // if (pairsFound === 0) console.log('      (nenhum par encontrado — estrutura pode ter mudado)');

  // Extração final
  const record = {};
  tableIndicators.find('div, span').each((_, element) => {
    const $el      = $(element);
    const children = $el.children();
    if (children.length < 2) return;
    const label = children.eq(0).text().trim()
      .replace(/\s*-\s*[A-Z0-9]{3,6}$/i, '').trim().toUpperCase();
    const value = children.eq(1).text().trim();
    if (!label || !value || label === value || label.length >= 50) return;
    const key = I10_MAP[label];
    if (!key) return;
    const parsed = I10_PCT.has(key) ? parsePct(value) : parseNum(value);
    if (parsed != null) record[key] = parsed;
  });

  const result = { source: 'investidor10', price, ...record };

  // console.log('\n    Indicadores mapeados:');
  // const shown = new Set();
  // for (const [label, key] of Object.entries(I10_MAP)) {
  //   if (shown.has(key)) continue;
  //   shown.add(key);
  //   const val  = record[key] ?? null;
  //   const flag = val == null ? '❌' : '✅';
  //   console.log(`      ${flag} ${label.padEnd(28)} → ${fmtVal(val)}`);
  // }
  return result;
}

// ─── FUNDAMENTUS ──────────────────────────────────────────────

async function testFundamentus(ticket) {
  sep(`📊  FUNDAMENTUS  |  https://www.fundamentus.com.br/detalhes.php?papel=${ticket}`);

  // ⚠️ Fundamentus serve ISO-8859-1 — iconv obrigatório para acentos corretos
  const html = await getHtmlLatin1(`https://www.fundamentus.com.br/detalhes.php?papel=${ticket}`);
  if (!html) return null;

  const $ = cheerio.load(html);

  // Todas as table.w728 dentro de div.conteudo
  const allTables = $('div.conteudo table.w728');
  const table1    = allTables.eq(0);  // 1ª tabela → Cotação
  const table3    = allTables.eq(2);  // 3ª tabela → Indicadores fundamentalistas

  // Diagnóstico de estruturas
  // console.log('\n    Estruturas encontradas:');
  // console.log(`      div.conteudo       : ${$('div.conteudo').length > 0 ? '✅' : '❌'}`);
  // console.log(`      table.w728 (total) : ${allTables.length} tabelas`);
  // console.log(`      table[0] span.txt  : ${table1.find('span.txt').length} elementos  ← cotação`);
  // console.log(`      table[2] span.txt  : ${table3.find('span.txt').length} elementos  ← indicadores`);

  if (VERBOSE) {
    console.log('\n    span.txt na 1ª tabela (cotação):');
    table1.find('span.txt').each((_, el) =>
      console.log(`      "${$(el).text().trim()}"`)
    );
    console.log('\n    span.txt na 3ª tabela (indicadores):');
    table3.find('span.txt').each((_, el) =>
      console.log(`      "${$(el).text().trim()}"`)
    );
  }

  // ── Cotação — 1ª tabela ──────────────────────────────────────
  let priceRaw = null, price = null;
  table1.find('td.label').each((_, el) => {
    if ($(el).text().trim().toLowerCase().includes('cotação')) {
      priceRaw = $(el).next('td').find('span.txt').first().text().trim();
      price    = parseNum(priceRaw);
      return false;
    }
  });
  // console.log(`\n    Cotação (tabela 1) raw: "${priceRaw}" → ${price}`);

  // ── Mapeamento de labels → chave interna ─────────────────────
  const FUND_MAP = {
    'p/l':            { key: 'pl',            pct: false },
    'p/vp':           { key: 'pvp',           pct: false },
    'div.yield':      { key: 'dy',            pct: true  },
    'div. yield':     { key: 'dy',            pct: true  },
    'dividend yield': { key: 'dy',            pct: true  },
    'marg. líquida':  { key: 'margemLiquida', pct: true  },
    'marg. liquida':  { key: 'margemLiquida', pct: true  },
    'roe':            { key: 'roe',           pct: true  },
    'roa':            { key: 'roa',           pct: true  },
    'liq. corrente':  { key: 'liqCorrente',   pct: false },
    'liquidez corr':  { key: 'liqCorrente',   pct: false },
    'liquidez corr.': { key: 'liqCorrente',   pct: false },
  };

  // ── Log de todos os span.txt da 3ª tabela ────────────────────
  // console.log('\n    Todos os span.txt na 3ª tabela (indicadores):');
  // let spanCount = 0;
  // table3.find('span.txt').each((_, el) => {
  //   const text = $(el).text().trim();
  //   if (!text) return;
  //   spanCount++;
  //   const cfg     = FUND_MAP[text.toLowerCase()];
  //   const mapped  = cfg ? `→ [${cfg.key}]` : '(não mapeado)';
  //   const valRaw  = $(el).closest('td').next('td').find('span.txt').first().text().trim();
  //   const display = valRaw ? `= "${valRaw}"` : '';
  //   console.log(`      "${text.padEnd(22)}" ${display.padEnd(15)} ${mapped}`);
  // });
  // if (spanCount === 0) console.log('      (nenhum span.txt na 3ª tabela — verifique o índice)');

  // ── Extração final — 3ª tabela ───────────────────────────────
  const record = {};
  table3.find('span.txt').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const cfg  = FUND_MAP[text];
    if (!cfg) return;
    const value  = $(el).closest('td').next('td').find('span.txt').first().text().trim();
    const parsed = cfg.pct ? parsePct(value) : parseNum(value);
    if (parsed != null) record[cfg.key] = parsed;
  });

  const result = { source: 'fundamentus', price, ...record };

  // console.log('\n    Indicadores mapeados (3ª tabela):');
  // const shown = new Set();
  // for (const [label, cfg] of Object.entries(FUND_MAP)) {
  //   if (shown.has(cfg.key)) continue;
  //   shown.add(cfg.key);
  //   const val  = record[cfg.key] ?? null;
  //   const flag = val == null ? '❌' : '✅';
  //   console.log(`      ${flag} ${label.padEnd(22)} → ${fmtVal(val)}`);
  // }
  return result;
}

// ─── STATUSINVEST ─────────────────────────────────────────────

async function testStatusInvest(ticket) {
  sep(`📈  STATUSINVEST  |  https://statusinvest.com.br/acoes/${ticket.toLowerCase()}`);
  const html = await getHtml(`https://statusinvest.com.br/acoes/${ticket.toLowerCase()}`);
  if (!html) return null;

  const $ = cheerio.load(html);

  const container  = $('.indicator-today-container');
  const indicators = container.find('.indicators');

  // Diagnóstico de estruturas
  // console.log('\n    Estruturas encontradas:');
  // console.log(`      [title="Valor atual do ativo"]  : ${$('[title="Valor atual do ativo"]').length}`);
  // console.log(`      .indicator-today-container      : ${container.length}`);
  // console.log(`      .indicators dentro do container : ${indicators.length}`);
  // console.log(`      a[title] dentro de .indicators  : ${indicators.find('a[title]').length}`);
  // console.log(`      strong dentro de .indicators    : ${indicators.find('strong').length}`);

  if (VERBOSE) {
    console.log('\n    Todos os a[title] com strong irmão:');
    indicators.find('a[title]').each((_, el) => {
      const t = $(el).attr('title');
      const v = $(el).nextAll('strong').first().text().trim()
             || $(el).parent().find('strong').first().text().trim();
      console.log(`      title="${t}" → strong="${v}"`);
    });
  }

  // ── Cotação — já funcionava ──────────────────────────────────
  const priceRaw = $('[title="Valor atual do ativo"] strong, [title="Valor atual"] strong').first().text();
  const price    = parseNum(priceRaw);
  // console.log(`\n    Cotação raw: "${priceRaw}" → ${price}`);

  // ── Mapeamento (após remover prefixo) → chave interna ───────
  const SI_MAP = {
    'p/l':                   { key: 'pl',            pct: false },
    'p/vp':                  { key: 'pvp',           pct: false },
    'd.y':                   { key: 'dy',            pct: true  },
    'dividend yield':        { key: 'dy',            pct: true  },
    'peg ratio':             { key: 'pegRatio',      pct: false },
    'payout':                { key: 'payout',        pct: true },
    'm.líquida':             { key: 'margemLiquida', pct: true  },
    'm. líquida':            { key: 'margemLiquida', pct: true  },
    'm.liquida':             { key: 'margemLiquida', pct: true  },
    'm. liquida':            { key: 'margemLiquida', pct: true  },
    'margem líquida':        { key: 'margemLiquida', pct: true  },
    'dív. líquida/ebitda':   { key: 'dividaEbitda',  pct: false },
    'dívida líquida/ebitda': { key: 'dividaEbitda',  pct: false },
    'roe':                   { key: 'roe',           pct: true  },
    'roa':                   { key: 'roa',           pct: true  },
    'liq. corrente':         { key: 'liqCorrente',   pct: false },
    'liquidez corrente':     { key: 'liqCorrente',   pct: false },
  };

  // Remove "Artigo detalhando " do início do title
  const cleanTitle = (raw) =>
    (raw ?? '').trim().replace(/^artigo detalhando /i, '').toLowerCase();

  /*
  // ── Log de TODOS os a[title] encontrados ─────────────────────
  console.log('\n    Todos os a[title] em .indicator-today-container .indicators:');
  let found = 0;
  indicators.find('a[title]').each((_, el) => {
    const rawTitle = $(el).attr('title')?.trim() ?? '';
    if (!rawTitle) return;
    found++;
    // Valor: <strong> imediatamente após o <a> (irmão), ou dentro do pai
    const value  = $(el).nextAll('strong').first().text().trim()
                || $(el).parent().find('strong').first().text().trim();
    const title  = cleanTitle(rawTitle);
    const cfg    = SI_MAP[title];
    const mapped = cfg ? `→ [${cfg.key}]` : '(não mapeado)';
    console.log(`      "${rawTitle.padEnd(42)}" → "${title.padEnd(25)}" strong="${value}" ${mapped}`);
  });
  if (found === 0) console.log('      (nenhum a[title] encontrado — estrutura pode ter mudado)');

  // PEG Ratio — busca por h3.title contendo "peg"
  indicators.find('h3.title').each((_, el) => {
    if (!$(el).text().toLowerCase().includes('peg')) return;
    const value = $(el).nextAll('strong').first().text().trim()
               || $(el).parent().find('strong').first().text().trim();
    console.log(`      [h3.title PEG]  text="${$(el).text().trim()}" strong="${value}" → ${fmtVal(parseNum(value))}`);
  });
  */

  // ── Extração final ───────────────────────────────────────────
  const record = {};

  // 1. Indicadores via <a title="Artigo detalhando X"> + <strong> irmão
  indicators.find('a[title]').each((_, el) => {
    const title = cleanTitle($(el).attr('title'));
    const cfg   = SI_MAP[title];
    if (!cfg) return;
    const value  = $(el).nextAll('strong').first().text().trim()
                || $(el).parent().find('strong').first().text().trim();
    const parsed = cfg.pct ? parsePct(value) : parseNum(value);
    if (parsed != null) record[cfg.key] = parsed;
  });

  // 2. PEG Ratio — <h3 class="title ...">PEG Ratio</h3> + <strong> irmão
  indicators.find('h3.title').each((_, el) => {
    if (!$(el).text().toLowerCase().includes('peg')) return;
    const value  = $(el).nextAll('strong').first().text().trim()
                || $(el).parent().find('strong').first().text().trim();
    const parsed = parseNum(value);
    if (parsed != null) record['pegRatio'] = parsed;
    return false;
  });

  // 3. Payout — API JSON direta (mais confiável que scraping do HTML)
  //    GET https://statusinvest.com.br/acao/payoutresult?code=PETR4&type=0
  //    Retorna JSON com campo "actual_F" contendo o valor em %
  try {
    const payoutUrl = `https://statusinvest.com.br/acao/payoutresult?code=${ticket}&type=0`;
    const payoutRes = await client.get(payoutUrl, {
      responseType: 'json',
      headers: { ...client.defaults.headers, 'X-Requested-With': 'XMLHttpRequest' },
    });
    const payoutJson = payoutRes.data;
    console.log(`\n      Payout API → HTTP ${payoutRes.status}`);
    console.log(`      JSON recebido: ${JSON.stringify(payoutJson).slice(0, 200)}`);
    const actualF   = payoutJson?.actual_F ?? payoutJson?.data?.actual_F ?? null;
    console.log(`      actual_F raw → "${actualF}"`);
    const payoutParsed = parsePct(String(actualF ?? ''));
    console.log(`      parsePct → ${payoutParsed}`);
    if (payoutParsed != null) record['payout'] = payoutParsed;
  } catch (e) {
    console.log(`\n      Payout API → ❌ ${e.message}`);
  }

  const result = { source: 'statusinvest', price, ...record };

  // console.log('\n    Indicadores mapeados:', result);
  // const shown = new Set();
  // for (const [title, cfg] of Object.entries(SI_MAP)) {
  //   if (shown.has(cfg.key)) continue;
  //   shown.add(cfg.key);
  //   const val  = record[cfg.key] ?? null;
  //   const flag = val == null ? '❌' : '✅';
  //   console.log(`      ${flag} ${title.padEnd(25)} → ${fmtVal(val)}`);
  // }
  return result;
}

// ─── Sumário ──────────────────────────────────────────────────

function printSummary(results) {
  ssep('📋  SUMÁRIO — valores por fonte');

  const fields  = ['price','pl','pvp','dy','payout','margemLiquida','roe','roa','liqCorrente','pegRatio','dividaEbitda'];
  const sources = results.filter(Boolean);

  console.log(`\n  ${'Campo'.padEnd(18)} ${'investidor10'.padStart(12)} ${'fundamentus'.padStart(12)} ${'statusinvest'.padStart(12)}`);
  console.log(`  ${'─'.repeat(56)}`);

  let totalOk = 0, totalNull = 0;
  for (const f of fields) {
    const vals      = sources.map(s => fmtVal(s[f] ?? null));
    const nullCount = sources.filter(s => (s[f] ?? null) === null).length;
    totalOk   += sources.length - nullCount;
    totalNull += nullCount;
    const warn = nullCount === sources.length && sources.length > 0 ? ' ⚠️' : '';
    console.log(`  ${f.padEnd(18)} ${vals.join('')}${warn}`);
  }

  console.log(`\n  Resultado: ${totalOk} valores extraídos, ${totalNull} null`);

  if (totalOk === 0) {
    console.log(`\n  ⚠️  Nenhum valor extraído. Possíveis causas:`);
    console.log(`     1. Site bloqueou o acesso (CAPTCHA, rate limit, IP ban)`);
    console.log(`     2. Estrutura HTML mudou — use --verbose para ver o HTML real`);
    console.log(`     3. Problemas de rede`);
    console.log(`\n  💡 Tente: node testScraper.mjs ${(results[0]?.source ?? 'PETR4')} --verbose`);
  }
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const runners = {
    investidor10: () => testInvestidor10(TICKET),
    fundamentus:  () => testFundamentus(TICKET),
    statusinvest: () => testStatusInvest(TICKET),
  };

  let results = [];

  if (FONTE) {
    if (!runners[FONTE]) {
      console.error(`❌ Fonte inválida: "${FONTE}". Use: investidor10 | fundamentus | statusinvest`);
      process.exit(1);
    }
    results = [await runners[FONTE]()];
  } else {
    const settled = await Promise.allSettled(Object.values(runners).map(fn => fn()));
    results = settled.map(r => r.status === 'fulfilled' ? r.value : null);
  }

  printSummary(results.filter(Boolean));
  console.log('');
}

main().catch(e => {
  console.error('\n❌ Erro fatal:', e.message);
  process.exit(1);
});
