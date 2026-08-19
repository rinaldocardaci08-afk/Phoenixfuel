// PhoenixFuel — Edge Function "mercato-chiusura"
// v20260818a
//
// COSA FA
//   Gira col cron alle 17:30. Chiede i dati a mercato-gasolio (la funzione che
//   c'e' gia' e che ha le chiavi delle API: non la riscrivo), calcola l'effetto
//   in euro sul carico, va a vedere se i fornitori hanno quotato PER DOMANI e
//   scrive un post in bacheca_post con priorita' urgente.
//
// REGOLE CONCORDATE
//   - Il verso lo decide l'effetto in EURO, non il conteggio dei segnali:
//     Brent e cambio non pesano uguale.
//   - Soglia 350 € a carico: sotto, il consiglio dice di stare fermi.
//   - Un listino vale UN GIORNO. Si mostra solo la quotazione con data = domani.
//     Se non c'e', la sezione prezzi non esiste: solo andamento dei mercati.
//     Il venerdi' si risolve da solo perche' il fornitore scrive gia' le righe
//     di sabato e lunedi'. Nessun calendario dei festivi, che si romperebbe.
//   - Un solo post al giorno: se c'e' gia' quello di oggi, non ne scrive un altro.
//
// TESTO
//   bacheca_post.contenuto viene mostrato da pf-home.js con esc() piu' **grassetto**
//   e a capo: quindi TESTO SEMPLICE, niente HTML.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOGLIA_EURO = 350;
const LITRI_CARICO = 35000;
const BARILE_LITRI = 158.987;

function n(x: number, d: number): string {
  return x.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function seg(x: number, d: number): string {
  return (x >= 0 ? '+' : '\u2212') + n(Math.abs(x), d);
}
function iso(d: Date): string {
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  const URL_SB = Deno.env.get('SUPABASE_URL')!;
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(URL_SB, KEY);

  try {
    const oggi = new Date();
    const oggiISO = iso(oggi);
    const domani = new Date(oggi);
    domani.setDate(domani.getDate() + 1);
    const domaniISO = iso(domani);

    // ── Un solo post al giorno ───────────────────────────────────
    const { data: gia } = await sb.from('bacheca_post')
      .select('id').eq('tipo', 'mercato')
      .gte('created_at', oggiISO + 'T00:00:00').limit(1);
    if (gia && gia.length) {
      return new Response(JSON.stringify({ ok: true, saltato: 'post di oggi gia presente' }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Dati di mercato: li chiedo alla funzione che c'e' gia' ───
    const rq = await fetch(URL_SB + '/functions/v1/mercato-gasolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ prova: true })
    });
    const d = await rq.json();
    if (!d || !d.ok) throw new Error('mercato-gasolio: ' + (d?.errore || 'nessuna risposta'));

    const brentOra = Number(d.brent || 0);
    const camOra = Number(d.cambio || 0);
    const pet = Number(d.petrolio_euro_litro || 0);
    if (!brentOra || !camOra) throw new Error('valori di mercato mancanti');

    // ── Chiusura precedente ──────────────────────────────────────
    const { data: st } = await sb.from('futures_storico')
      .select('data,brent_usd,eurusd')
      .not('brent_usd', 'is', null)
      .lt('data', oggiISO)
      .order('data', { ascending: false }).limit(1);
    if (!st || !st.length) throw new Error('nessuna chiusura precedente in futures_storico');

    const brentPrec = Number(st[0].brent_usd);
    const camPrec = Number(st[0].eurusd);

    // ── Scomposizione: le due parti sommate ridanno il totale ────
    const petPrec = brentPrec / BARILE_LITRI / camPrec;
    const petCamFermo = brentOra / BARILE_LITRI / camPrec;
    const effPetrolio = petCamFermo - petPrec;
    const effCambio = pet - petCamFermo;
    const deltaEuroL = pet - petPrec;
    const eff = deltaEuroL * LITRI_CARICO;

    const pctB = brentPrec ? (brentOra - brentPrec) / brentPrec * 100 : 0;
    const pctC = camPrec ? (camOra - camPrec) / camPrec * 100 : 0;
    const opposti = (effPetrolio > 0 && effCambio < 0) || (effPetrolio < 0 && effCambio > 0);
    const sottoSoglia = Math.abs(eff) < SOGLIA_EURO;

    // ── Quotazioni PER DOMANI: gasolio auto, base Vibo ───────────
    const { data: pz } = await sb.from('prezzi')
      .select('data,fornitore,costo_litro,basi_carico(nome)')
      .ilike('prodotto', '%gasolio%auto%')
      .in('data', [oggiISO, domaniISO]);

    const vibo = (pz || []).filter((x: any) => {
      const b = x.basi_carico && x.basi_carico.nome ? String(x.basi_carico.nome) : '';
      return /vibo/i.test(b) && Number(x.costo_litro) > 0;
    });

    const perForn: Record<string, { oggi?: number; domani?: number }> = {};
    vibo.forEach((x: any) => {
      const f = String(x.fornitore || '').trim();
      if (!perForn[f]) perForn[f] = {};
      if (x.data === domaniISO) perForn[f].domani = Number(x.costo_litro);
      if (x.data === oggiISO) perForn[f].oggi = Number(x.costo_litro);
    });
    const quotati = Object.keys(perForn)
      .filter((f) => perForn[f].domani != null)
      .sort();

    // ── Testo ────────────────────────────────────────────────────
    let titolo: string;
    if (sottoSoglia) {
      titolo = 'Mercati ' + oggiISO.split('-').reverse().slice(0, 2).join('/')
        + ' \u2014 ' + (opposti ? 'i due fattori si compensano' : 'movimento sotto soglia');
    } else {
      titolo = 'Mercati ' + oggiISO.split('-').reverse().slice(0, 2).join('/')
        + ' \u2014 costo in ' + (eff > 0 ? 'salita' : 'calo') + ', '
        + seg(eff, 0) + ' \u20ac a carico';
    }

    let t = 'Brent ' + n(brentPrec, 2) + ' -> ' + n(brentOra, 2) + ' $/barile ('
      + seg(pctB, 2) + '%): '
      + (effPetrolio > 0 ? 'spinge il costo in su' : effPetrolio < 0 ? 'spinge il costo in giu' : 'fermo')
      + ' di **' + seg(effPetrolio, 4) + ' \u20ac/L**.\n';

    t += 'Cambio ' + n(camPrec, 4) + ' -> ' + n(camOra, 4) + ' (' + seg(pctC, 2) + '%): '
      + (effCambio < 0
        ? "l'euro si rafforza e, siccome il petrolio si compra in dollari, restituisce"
        : effCambio > 0 ? "l'euro si indebolisce e aggiunge" : 'il cambio non sposta niente,')
      + ' **' + seg(effCambio, 4) + ' \u20ac/L**.\n\n';

    t += 'Effetto netto **' + seg(deltaEuroL, 4) + ' \u20ac/L** \u2014 sul carico da '
      + n(LITRI_CARICO, 0) + ' L: **' + seg(eff, 0) + ' \u20ac**.\n\n';

    if (quotati.length) {
      t += 'Prezzi per domani ' + domaniISO.split('-').reverse().join('/')
        + ' (gasolio auto, base Vibo):\n';
      quotati.forEach((f) => {
        const r = perForn[f];
        t += '\u2022 ' + f + ' **' + n(r.domani!, 6) + '**';
        if (r.oggi != null) {
          const dv = r.domani! - r.oggi;
          t += ' (oggi ' + n(r.oggi, 6) + ', ' + seg(dv * 1000, 0) + ' millesimi)';
        }
        t += '\n';
      });
      const senza = Object.keys(perForn).filter((f) => perForn[f].domani == null).sort();
      if (senza.length) t += 'Non hanno quotato per domani: ' + senza.join(', ') + '.\n';
      t += '\n';
    } else {
      t += 'Nessun fornitore ha quotato per domani: i prezzi non vengono mostrati, '
        + 'quello di oggi vale solo per oggi.\n\n';
    }

    if (sottoSoglia) {
      t += '**Consiglio non vincolante:** lo scarto resta sotto la soglia di ' + SOGLIA_EURO
        + ' \u20ac a carico. Non vale la pena anticipare o rinviare: spostare un carico per '
        + 'questa cifra costa piu in rotture di magazzino che in risparmio.';
    } else if (eff > 0) {
      t += '**Consiglio non vincolante:** i segnali puntano al rialzo. Se devi caricare per il '
        + 'deposito nei prossimi giorni, va ragionata la possibilita di **anticipare** '
        + "l'acquisto. Il movimento di oggi si riflette sul listino dopo due quotazioni.";
    } else {
      t += '**Consiglio non vincolante:** i segnali puntano al ribasso. Se hai un carico '
        + 'programmato, va ragionata la possibilita di **rinviarlo** di qualche giorno. '
        + 'Il movimento di oggi si riflette sul listino dopo due quotazioni.';
    }

    // ── Storico e post ───────────────────────────────────────────
    await sb.from('futures_storico').upsert({
      data: oggiISO,
      brent_usd: Math.round(brentOra * 100) / 100,
      eurusd: Math.round(camOra * 10000) / 10000,
      prezzo_euro_litro: Math.round(pet * 100000) / 100000,
      var_euro_litro: Math.round(deltaEuroL * 100000) / 100000
    }, { onConflict: 'data' });

    const ins = await sb.from('bacheca_post').insert([{
      titolo: titolo,
      contenuto: t,
      tipo: 'mercato',
      priorita: sottoSoglia ? 'normale' : 'urgente',
      autore_nome: 'PhoenixFuel \u2014 automatico',
      attivo: true
    }]).select('id').single();
    if (ins.error) throw new Error('bacheca: ' + ins.error.message);

    return new Response(JSON.stringify({
      ok: true, post_id: ins.data.id, titolo: titolo,
      eff: Math.round(eff), quotati: quotati
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, errore: String(e?.message || e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
