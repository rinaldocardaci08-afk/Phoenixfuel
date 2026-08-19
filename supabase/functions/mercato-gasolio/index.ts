// mercato-gasolio.ts — Supabase Edge Function
// v20260803c — nomi di colonna presi dallo schema vero: la colonna e
//              `var_euro_litro`, non `variazione`. Riempiti anche
//              `segnale` e `impatto_pct`, che la pagina usa.
// v20260803b — `dettaglio` torna a essere un ELENCO in tutti i punti di
//              risposta: la pagina ci chiama sopra .join(), e con una
//              stringa si rompeva.
// v20260803a
//
// COSA FA ORA, E PERCHE E CAMBIATO
// Fino a ieri cercava la quotazione ICE Gasoil su quattro sigle diverse:
// tutte rispondono 404, perche quel dato la borsa lo vende e le fonti
// gratuite che lo giravano hanno chiuso. Rinaldo si e sempre orientato in
// un altro modo, e funzionava: BRENT + CAMBIO EURO/DOLLARO, con una sua
// formula tarata negli anni.
//
// Quindi questa funzione ora interroga DUE SOLE COSE:
//   1. Brent (ICE Brent Crude) in dollari al barile
//   2. Cambio EUR/USD
// Niente altro. Nessuna sigla a tentativi.
//
// La formula di Rinaldo non e ancora nota: appena arriva si mette in
// FORMULA_GASOLIO qui sotto e la funzione comincia a scrivere anche la
// stima del gasolio. Finche non c'e, si salvano i due dati grezzi piu il
// petrolio convertito in euro/litro — che e gia un orientamento vero.
//
// Chiamate:
//   {}                  -> chiusura di oggi
//   { giorni: 180 }     -> ricostruisce lo storico
//   { prova: true }     -> dice solo se le due fonti rispondono (NON scrive)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LITRI_BARILE = 158.987;

// Quando Rinaldo ritrova la formula del vecchio Excel, si scrive qui.
// Riceve il petrolio in euro/litro e restituisce la stima del gasolio.
// null = formula non ancora impostata.
const FORMULA_GASOLIO: ((petrolioEuroLitro: number) => number) | null = null;

// ── Brent: Yahoo BZ=F, con stooq come riserva ─────────────────────
async function brentOggi(): Promise<{ v: number | null; nota: string }> {
  let notaY = '';
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=5d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (r.ok) {
      const j = await r.json();
      const c = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      for (let i = c.length - 1; i >= 0; i--) {
        if (typeof c[i] === 'number') return { v: c[i], nota: 'brent yahoo BZ=F: ok' };
      }
      return { v: null, nota: 'brent yahoo BZ=F: risposta senza prezzi' };
    }
    notaY = 'brent yahoo BZ=F: risposta ' + r.status;
  } catch (e) {
    notaY = 'brent yahoo BZ=F: ' + (e as Error).message;
  }
  try {
    const r2 = await fetch('https://stooq.com/q/l/?s=cb.f&f=sd2t2ohlcv&h&e=csv');
    if (r2.ok) {
      const righe = (await r2.text()).trim().split('\n');
      const val = parseFloat((righe[1] || '').split(',')[6]);
      if (!isNaN(val) && val > 0) return { v: val, nota: notaY + ' · brent stooq cb.f: ok' };
      return { v: null, nota: notaY + ' · brent stooq cb.f: csv senza prezzo' };
    }
    return { v: null, nota: notaY + ' · brent stooq cb.f: risposta ' + r2.status };
  } catch (e) {
    return { v: null, nota: notaY + ' · brent stooq cb.f: ' + (e as Error).message };
  }
}

// ── Cambio EUR/USD: frankfurter (BCE), l'unica fonte che non ha mai
//    fallito in queste prove ─────────────────────────────────────────
async function cambioOggi(): Promise<{ v: number | null; nota: string }> {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    if (r.ok) {
      const j = await r.json();
      const v = j?.rates?.USD;
      if (typeof v === 'number') return { v, nota: 'cambio frankfurter: ok' };
      return { v: null, nota: 'cambio frankfurter: risposta senza USD' };
    }
    return { v: null, nota: 'cambio frankfurter: risposta ' + r.status };
  } catch (e) {
    return { v: null, nota: 'cambio frankfurter: ' + (e as Error).message };
  }
}

// ── Serie storiche, per il recupero in blocco ─────────────────────
async function brentSerie(giorni: number) {
  const range = giorni > 365 ? '2y' : (giorni > 180 ? '1y' : '6mo');
  const r = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=' + range,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!r.ok) return { serie: null, nota: 'storico brent BZ=F: risposta ' + r.status };
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const cl = res?.indicators?.quote?.[0]?.close ?? [];
  const out: Record<string, number> = {};
  for (let i = 0; i < ts.length; i++) {
    if (typeof cl[i] !== 'number') continue;
    out[new Date(ts[i] * 1000).toISOString().split('T')[0]] = cl[i];
  }
  const n = Object.keys(out).length;
  return { serie: n ? out : null, nota: 'storico brent BZ=F: ' + n + ' giorni' };
}

async function cambioSerie(giorni: number) {
  const da = new Date();
  da.setDate(da.getDate() - giorni);
  const r = await fetch(
    'https://api.frankfurter.app/' + da.toISOString().split('T')[0] + '..?from=EUR&to=USD'
  );
  if (!r.ok) return { serie: null, nota: 'storico cambio: risposta ' + r.status };
  const j = await r.json();
  const out: Record<string, number> = {};
  Object.keys(j?.rates ?? {}).forEach((d) => { out[d] = j.rates[d].USD; });
  const n = Object.keys(out).length;
  return { serie: n ? out : null, nota: 'storico cambio: ' + n + ' giorni' };
}

// Petrolio da $/barile a €/litro. E il numero su cui Rinaldo si orientava.
function petrolioEuroLitro(brentUsd: number, eurusd: number) {
  return Math.round((brentUsd / LITRI_BARILE / eurusd) * 100000) / 100000;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const passi: string[] = [];
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* chiamata senza corpo */ }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // ── solo prova: rispondono? NON scrive nulla a database ──
    if (body.prova) {
      const b = await brentOggi();
      const c = await cambioOggi();
      return new Response(JSON.stringify({
        ok: !!(b.v && c.v),
        brent: b.v, cambio: c.v,
        petrolio_euro_litro: (b.v && c.v) ? petrolioEuroLitro(b.v, c.v) : null,
        dettaglio: [b.nota, c.nota]
      }), { headers: cors });
    }

    // ── recupero storico ──
    if (body.giorni) {
      const g = Number(body.giorni) || 180;
      const bs = await brentSerie(g); passi.push(bs.nota);
      const cs = await cambioSerie(g); passi.push(cs.nota);
      if (!bs.serie || !cs.serie) {
        return new Response(JSON.stringify({
          ok: false, errore: 'nessun giorno ricostruito', dettaglio: passi
        }), { headers: cors });
      }
      const date = Object.keys(bs.serie).sort();
      const cambi = Object.keys(cs.serie).sort();
      const righe: any[] = [];
      let prec: number | null = null;
      for (const d of date) {
        // nei giorni di chiusura del cambio si usa l'ultimo disponibile
        let camb: number | null = null;
        for (let i = cambi.length - 1; i >= 0; i--) {
          if (cambi[i] <= d) { camb = cs.serie[cambi[i]]; break; }
        }
        if (!camb) continue;
        const pet = petrolioEuroLitro(bs.serie[d], camb);
        const stima = FORMULA_GASOLIO ? Math.round(FORMULA_GASOLIO(pet) * 100000) / 100000 : null;
        const valore = stima ?? pet;
        const dVal = prec === null ? 0 : Math.round((valore - prec) * 100000) / 100000;
        const pct = (prec && prec !== 0) ? (dVal / prec) * 100 : 0;
        righe.push({
          data: d, brent_usd: bs.serie[d], eurusd: camb,
          prezzo_euro_litro: valore,
          var_euro_litro: dVal,
          segnale: pct > 1.5 ? 'rialzo' : (pct < -1.5 ? 'ribasso' : 'stabile'),
          impatto_pct: Math.round(pct * 100) / 100
        });
        prec = valore;
      }
      for (let i = 0; i < righe.length; i += 200) {
        const { error } = await sb.from('futures_storico')
          .upsert(righe.slice(i, i + 200), { onConflict: 'data' });
        if (error) throw error;
      }
      return new Response(JSON.stringify({
        ok: true, scritti: righe.length,
        formula: FORMULA_GASOLIO ? 'stima gasolio' : 'petrolio in euro/litro (formula non ancora impostata)',
        dettaglio: passi
      }), { headers: cors });
    }

    // ── chiusura di oggi ──
    const b = await brentOggi(); passi.push(b.nota);
    const c = await cambioOggi(); passi.push(c.nota);
    if (!b.v) {
      return new Response(JSON.stringify({
        ok: false, errore: 'quotazione brent non disponibile', dettaglio: passi
      }), { headers: cors });
    }
    if (!c.v) {
      return new Response(JSON.stringify({
        ok: false, errore: 'cambio euro/dollaro non disponibile', dettaglio: passi
      }), { headers: cors });
    }
    const pet = petrolioEuroLitro(b.v, c.v);
    const stima = FORMULA_GASOLIO ? Math.round(FORMULA_GASOLIO(pet) * 100000) / 100000 : null;
    const valore = stima ?? pet;
    const oggi = new Date().toISOString().split('T')[0];

    const { data: ieri } = await sb.from('futures_storico')
      .select('prezzo_euro_litro').lt('data', oggi)
      .order('data', { ascending: false }).limit(1);
    const prec = ieri && ieri[0] ? Number(ieri[0].prezzo_euro_litro) : null;

    const dVal = prec === null ? 0 : Math.round((valore - prec) * 100000) / 100000;
    const pct = (prec && prec !== 0) ? (dVal / prec) * 100 : 0;
    const { error } = await sb.from('futures_storico').upsert([{
      data: oggi, brent_usd: b.v, eurusd: c.v,
      prezzo_euro_litro: valore,
      var_euro_litro: dVal,
      segnale: pct > 1.5 ? 'rialzo' : (pct < -1.5 ? 'ribasso' : 'stabile'),
      impatto_pct: Math.round(pct * 100) / 100
    }], { onConflict: 'data' });
    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true, data: oggi, brent: b.v, cambio: c.v, valore: valore,
      formula: FORMULA_GASOLIO ? 'stima gasolio' : 'petrolio in euro/litro (formula non ancora impostata)',
      dettaglio: passi
    }), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, errore: (e as Error).message, dettaglio: passi
    }), { headers: cors });
  }
});
