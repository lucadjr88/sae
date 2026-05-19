import express, { Router, Request, Response } from 'express';

const router: Router = express.Router();
const SDU_UPSTREAM_URL = process.env.SDU_FLEET_CHART_URL || 'http://192.168.1.153:3001/api/fleet-chart-data';

router.post('/fleet-chart-data', async (req: Request, res: Response) => {
  try {
    const { fleetIds, days } = req.body || {};
    if (!Array.isArray(fleetIds) || fleetIds.length === 0) {
      return res.status(400).json({ error: 'fleetIds required' });
    }

    const upstream = await fetch(SDU_UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fleetIds, days })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Failed to fetch SDU data',
        detail: (payload as any)?.error || upstream.statusText,
      });
    }

    return res.json(payload);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to fetch SDU data',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
