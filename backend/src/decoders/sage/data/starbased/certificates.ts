import type { SageInstructionDataset } from "../../../../types.js";

export const CERTIFICATES = [
  {
    "name": "CreateCertificateMint",
    "discriminator": "0xadbe2d74226d2259",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/create_certificate_mint.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "MintCertificate",
    "discriminator": "0x3502685433c5b30a",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/mint_certificate.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RedeemCertificate",
    "discriminator": "0xd4f185ac895331b1",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/redeem_certificate.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;