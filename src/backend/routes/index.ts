import express from 'express';

import debugRouter from './debug';
import getFleetsRouter from './get-fleets';
import getRentedFleetsRouter from './get-rented-fleets';
import getFleetInfoMinimalRouter from './get-fleet-info-minimal';

const router = express.Router();


router.use('/debug', debugRouter);
router.use('/debug', getFleetsRouter);
router.use('/debug', getRentedFleetsRouter);
router.use('/', getFleetInfoMinimalRouter);

export default router;
