import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';

import prezziBatchRouter from '../src/backend/routes/richiestaPrezziBckend';

test('retries upstream timeouts until a later attempt succeeds', async () => {
  const originalFetch = global.fetch;
  let attempts = 0;

  global.fetch = (async () => {
    attempts += 1;

    if (attempts < 5) {
      const abortError = new Error('simulated timeout');
      abortError.name = 'AbortError';
      throw abortError;
    }

    return new Response(JSON.stringify({
      prezzi: {
        foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG: {
          atlas: { prezzo_buy: 1.23, prezzo_sell: 1.11 },
          usdc: { prezzo_buy: 0.45, prezzo_sell: 0.40 },
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const app = express();
    app.use(express.json());
    app.use('/api', prezziBatchRouter);

    const response = await request(app)
      .post('/api/prezzi-batch')
      .send({ ricchiesta_prezzi: ['foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG'] });

    assert.equal(response.status, 200);
    assert.equal(attempts, 5);
    assert.equal(response.body?.prezzi?.foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG?.atlas?.prezzo_buy, 1.23);
  } finally {
    global.fetch = originalFetch;
  }
});
