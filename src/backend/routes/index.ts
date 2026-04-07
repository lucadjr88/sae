import express from 'express';

import debugRouter from './debug.js';
import getFleetsRouter from './get-fleets.js';
import getRentedFleetsRouter from './get-rented-fleets.js';
import getFleetInfoMinimalRouter from './get-fleet-info-minimal.js';

const router = express.Router();


router.use('/debug', debugRouter);
router.use('/debug', getFleetsRouter);
router.use('/debug', getRentedFleetsRouter);
router.use('/', getFleetInfoMinimalRouter);

export default router;
