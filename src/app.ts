
import 'dotenv/config.js';
import express from 'express';
import { installProcessLogContext } from './utils/log-context.js';
import analyzeProfileRouter from './analysis/analyzeProfile.js';
import debugRouter from './analysis/debug/index.js';
import getFleetsRouter from './backend/routes/get-fleets.js';
import getFleetInfoMinimalRouter from './backend/routes/get-fleet-info-minimal.js';
import { pricesRouter } from './backend/routes/prices.js';
import richiestaPrezziBckendRouter from './backend/routes/richiestaPrezziBckend.js';
import frontendRouter from './backend/routes/frontend.js';
import authRouter from './backend/routes/auth.js';
import resourceFlowsRouter from './backend/routes/resource-flows.js';
import assetsRouter from './backend/routes/assets.js';
import rentalRouter from './backend/routes/rental.js';
import { startNonInvasiveMetricsLogger } from './utils/rpc/metrics.js';

installProcessLogContext();

const PORT = 3000;

const app = express();
app.use(express.json());

// NOTE: removed global debug logging for static/frontend requests

app.use('/auth', authRouter);
app.use('/api', pricesRouter);
app.use('/api', richiestaPrezziBckendRouter);
app.use('/api', analyzeProfileRouter);
app.use('/api', resourceFlowsRouter);
app.use('/api/debug', debugRouter);

app.use('/api/debug', getFleetsRouter);
app.use('/api', getFleetInfoMinimalRouter);

// Serve static assets via API routes (for Android app)
app.use('/api', assetsRouter);
app.use('/api', rentalRouter);

// Serve frontend static files at /
app.use('/', frontendRouter);

app.listen(PORT, () => {
  const msg = `Server listening on port ${PORT}`;
  console.log(msg);
  // Log clickable local frontend link
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Frontend: http://localhost:${PORT}/`);
  }
  // start periodic non-invasive metrics logging (interval 30s)
  try { startNonInvasiveMetricsLogger(30000); } catch (e) {}
});

export default app;
