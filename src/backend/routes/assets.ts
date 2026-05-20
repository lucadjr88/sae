import express, { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router: Router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.argv.includes('tsx');
const distPath = isDev
  ? path.join(__dirname, '../../../dist')
  : path.join(__dirname, '../../');

// Middleware cache policy per asset hashati (immutabili)
const immutableCacheMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isHashedAsset = /\-[A-Za-z0-9_-]{8,}\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/i.test(req.path);
  if (isHashedAsset) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
};

// GET /api/assets/* → dist/assets/*
router.use('/assets', immutableCacheMiddleware, express.static(path.join(distPath, 'assets'), {
  maxAge: 0,
  setHeaders: (res, filepath) => {
    const isHashedFile = /\-[A-Za-z0-9_-]{8,}\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/i.test(filepath);
    if (isHashedFile) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// GET /api/pages/* → dist/pages/*
router.use('/pages', express.static(path.join(distPath, 'pages'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// GET /api/assets/manifest → manifest versionato con mappa asset
router.get('/assets/manifest', (req, res) => {
  try {
    const assetsDir = path.join(distPath, 'assets');
    const pagesDir = path.join(distPath, 'pages');
    
    const manifest: any = {
      buildId: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
      timestamp: Date.now(),
      assets: {}
    };

    // Scansiona asset principali (con pattern noti)
    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir);
      
      // Background
      const bgFile = assetFiles.find(f => f.startsWith('wp14018865-4k-earth-pc-wallpapers'));
      if (bgFile) manifest.assets.backgroundMain = `/api/assets/${bgFile}`;
      
      // Logo Star Atlas
      const logoFile = assetFiles.find(f => f.startsWith('staratlas-'));
      if (logoFile) manifest.assets.logoStarAtlas = `/api/assets/${logoFile}`;
      
      // Seedvault icon
      const seedvaultFile = assetFiles.find(f => f.startsWith('seedvault2-'));
      if (seedvaultFile) manifest.assets.iconSeedvault = `/api/assets/${seedvaultFile}`;

      // Manual icon
      const manualFile = assetFiles.find(f => f.startsWith('writing'));
      if (manualFile) manifest.assets.iconManual = `/api/assets/${manualFile}`;
      
      // Fee icon
      const feeFile = assetFiles.find(f => f.startsWith('taxes-'));
      if (feeFile) manifest.assets.iconFee = `/api/assets/${feeFile}`;

      // Resource icon
      const resourceFile = assetFiles.find(f => f.startsWith('risorseIcon_4-'));
      if (resourceFile) manifest.assets.iconResource = `/api/assets/${resourceFile}`;

      // Rental icon
      const rentalFile = assetFiles.find(f => f.startsWith('rental2-'));
      if (rentalFile) manifest.assets.iconRental = `/api/assets/${rentalFile}`;

      // Loading background (GIF)
      const loadingBgFile = assetFiles.find(f => f.startsWith('sequenza_background-'));
      if (loadingBgFile) manifest.assets.backgroundLoading = `/api/assets/${loadingBgFile}`;

      // Characters
      const charLeftFile = assetFiles.find(f => f.startsWith('personaggio2-'));
      if (charLeftFile) manifest.assets.characterLeft = `/api/assets/${charLeftFile}`;

      const charRightFile = assetFiles.find(f => f.startsWith('personaggio3-'));
      if (charRightFile) manifest.assets.characterRight = `/api/assets/${charRightFile}`;

      const charLoadingFile = assetFiles.find(f => f.startsWith('personaggio1-'));
      if (charLoadingFile) manifest.assets.characterLoading = `/api/assets/${charLoadingFile}`;

      // Istruzioni
      const istr1File = assetFiles.find(f => f.startsWith('istruzione1-'));
      if (istr1File) manifest.assets.imageInstruction1 = `/api/assets/${istr1File}`;
      
      const istr2File = assetFiles.find(f => f.startsWith('istruzione2-'));
      if (istr2File) manifest.assets.imageInstruction2 = `/api/assets/${istr2File}`;

      // SDU Program icons
      const sduWhiteFile = assetFiles.find(f => f.startsWith('sduProgramWhite-'));
      if (sduWhiteFile) manifest.assets.sduProgramWhite = `/api/assets/${sduWhiteFile}`;

      const sduBlackFile = assetFiles.find(f => f.startsWith('sduProgramBlack-'));
      if (sduBlackFile) manifest.assets.sduProgramBlack = `/api/assets/${sduBlackFile}`;
    }

    // Scansiona pagine
    if (fs.existsSync(pagesDir)) {
      manifest.assets.privacyPage = '/api/pages/privacy_policy.html';
      manifest.assets.instructionsPage = '/api/pages/instructions.html';
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
  } catch (err: any) {
    console.log('[assets/manifest] Error:', err);
    res.status(500).json({ error: 'Failed to generate manifest', details: err.message });
  }
});

export default router;
