/**
 * Alpaca Markets data-API CORS proxy — Cloudflare Worker
 * ---------------------------------------------------------------
 * Purpose: data.alpaca.markets does not send CORS headers, so browsers
 * block direct calls from a webpage. This worker sits in between:
 * the browser calls this worker (which DOES support CORS), and the
 * worker calls Alpaca server-side, attaching your API keys, which
 * never have to live in the browser at all.
 *
 * SETUP (no coding/CLI required):
 * 1. Go to https://dash.cloudflare.com -> sign up free if needed.
 * 2. Workers & Pages -> Create -> Create Worker -> give it a name
 *    (e.g. "alpaca-proxy") -> Deploy.
 * 3. Click "Edit code", delete the placeholder content, paste this
 *    entire file in, then click "Deploy".
 * 4. Go to the Worker's Settings -> Variables -> Add variable, twice:
 *      Name: ALPACA_KEY_ID      Value: <your key id>      (Encrypt: yes)
 *      Name: ALPACA_SECRET_KEY  Value: <your secret key>  (Encrypt: yes)
 *    Save and deploy.
 * 5. Copy your worker's URL (looks like
 *    https://alpaca-proxy.<your-subdomain>.workers.dev) and paste it
 *    into the Watchlist Manager's "Data Source" panel.
 *
 * That's it — your Alpaca keys never touch the browser again.
 */

const ALLOWED_ORIGIN = '*'; // tighten to your specific domain if you host this publicly

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Only allow the one endpoint we need, to keep this worker narrowly scoped
    if (url.pathname !== '/bars') {
      return json({ error: 'Not found. Use /bars?symbols=AAPL,MSFT' }, 404);
    }

    const symbols = url.searchParams.get('symbols');
    if (!symbols) {
      return json({ error: 'Missing required "symbols" query param' }, 400);
    }
    const timeframe = url.searchParams.get('timeframe') || '1Day';
    const limit = url.searchParams.get('limit') || '20';
    const feed = url.searchParams.get('feed') || 'iex';

    if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) {
      return json({ error: 'Worker is missing ALPACA_KEY_ID / ALPACA_SECRET_KEY env vars. Set them in Settings -> Variables.' }, 500);
    }

    const alpacaUrl = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbols)}&timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(limit)}&feed=${encodeURIComponent(feed)}`;

    try {
      const res = await fetch(alpacaUrl, {
        headers: {
          'APCA-API-KEY-ID': env.ALPACA_KEY_ID,
          'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY
        }
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    } catch (err) {
      return json({ error: `Upstream fetch failed: ${err.message || err}` }, 502);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
