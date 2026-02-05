import express from 'express';
import debugRouter from './debug';
import getFleetsRouter from './get-fleets';
import getRentedFleetsRouter from './get-rented-fleets';

const router = express.Router();

router.use('/debug', debugRouter);
router.use('/debug', getFleetsRouter);
router.use('/debug', getRentedFleetsRouter);

export default router;
