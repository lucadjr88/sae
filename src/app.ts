import 'dotenv/config.js';
import express from 'express';
import analyzeProfileRouter from './analysis/analyzeProfile';
import debugRouter from './analysis/debug/index';
import getFleetsRouter from './backend/routes/get-fleets';
import pricesRouter from './backend/routes/prices';
import frontendRouter from './backend/routes/frontend';
import authRouter from './backend/routes/auth.js';
import { startNonInvasiveMetricsLogger } from './utils/rpc/metrics';


const app = express();
app.use(express.json());

// NOTE: removed global debug logging for static/frontend requests

app.use('/auth', authRouter);
app.use('/api', pricesRouter);
app.use('/api', analyzeProfileRouter);
app.use('/api/debug', debugRouter);
app.use('/api/debug', getFleetsRouter);

// Serve frontend static files at /
app.use('/', frontendRouter);


const PORT = 3000;

app.listen(PORT, () => {
  const msg = `Server listening on port ${PORT}`;
  console.log(msg);
  // Log clickable local frontend link
  console.log(`Frontend: http://localhost:${PORT}/`);
  // start periodic non-invasive metrics logging (interval 30s)
  try { startNonInvasiveMetricsLogger(30000); } catch (e) {}
});

export default app;
