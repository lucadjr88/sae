import express from 'express';
import { json, urlencoded } from 'express';
import { PUBLIC_DIR } from './config/serverConfig.js';
import { router } from './routes/index.js';

export function createApp({ rpcPool, services }: any) {
  const app = express();
  app.use(express.static(PUBLIC_DIR));
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.use('/api', router({ rpcPool, services }));
  // error handler sarà montato dall'app caller
  return app;
}

export default createApp;
