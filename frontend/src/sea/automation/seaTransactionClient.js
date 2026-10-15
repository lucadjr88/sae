const prepareEndpoints = {
  scan: '/api/sea/scan/prepare',
  subwarp_start: '/api/sea/subwarp/prepare',
  warp_start: '/api/sea/warp/prepare',
  subwarp_exit: '/api/sea/movement/exit/prepare',
  warp_exit: '/api/sea/movement/exit/prepare',
};

export class SeaTransactionClient {
  constructor(wallet, fetchImpl = fetch) {
    this.wallet = wallet;
    this.fetch = fetchImpl.bind(globalThis);
  }

  async walletAddress() {
    if (!this.wallet?.isConnected) await this.wallet?.connect();
    const address = this.wallet?.publicKey?.toString();
    if (!address) throw new Error('Wallet browser non collegato');
    return address;
  }

  async prepareAction({ profileId, fleetId, destination, action, starbase, feeMode = 'sly', priorityFeeLamports = 1 }) {
    const endpoint = prepareEndpoints[action];
    if (!endpoint) throw new Error('Azione Sea non supportata');

    const requestBody = {
      profileId,
      fleetId,
      wallet: await this.walletAddress(),
      coordinates: [destination.x, destination.y],
      feeMode,
      priorityFeeLamports,
    };
    if (action === 'subwarp_start' || action === 'warp_start') requestBody.starbase = starbase;

    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || result.error || `HTTP ${response.status}`);
    return { ...result, action: result.action ?? action };
  }

  async signAndSubmit({ prepareId, profileId, transaction, action }) {
    const wallet = await this.walletAddress();
    const { VersionedTransaction } = await import('@solana/web3.js');
    const transactionBytes = Uint8Array.from(atob(transaction), character => character.charCodeAt(0));
    const unsigned = VersionedTransaction.deserialize(transactionBytes);
    const preparedMessageBytes = unsigned.message.serialize();
    console.info('[SDU] requesting wallet signature', { action });
    let signed;
    try {
      signed = await this.wallet.adapter.signTransaction(unsigned);
    } catch (error) {
      console.error('[SDU] wallet signature failed', {
        action,
        name: error?.name,
        message: error?.message ?? String(error),
        code: error?.code,
        logs: error?.logs ?? error?.data?.logs ?? error?.cause?.logs,
        cause: error?.cause?.message ?? error?.cause,
      });
      throw error;
    }
    console.info('[SDU] wallet signature received', { action });
    const signedMessageBytes = signed.message.serialize();
    const messageMatches = preparedMessageBytes.length === signedMessageBytes.length
      && preparedMessageBytes.every((byte, index) => byte === signedMessageBytes[index]);
    const preparedKeys = unsigned.message.staticAccountKeys ?? unsigned.message.accountKeys;
    const signedKeys = signed.message.staticAccountKeys ?? signed.message.accountKeys;
    const changedAccountKeyIndexes = Array.from({ length: Math.max(preparedKeys.length, signedKeys.length) }, (_, index) => index)
      .filter(index => !preparedKeys[index]?.equals(signedKeys[index]));
    const accountKeysMatch = changedAccountKeyIndexes.length === 0;
    const preparedInstructions = unsigned.message.compiledInstructions ?? unsigned.message.instructions ?? [];
    const signedInstructions = signed.message.compiledInstructions ?? signed.message.instructions ?? [];
    const instructionDifferences = Array.from({ length: Math.max(preparedInstructions.length, signedInstructions.length) }, (_, index) => {
      const preparedInstruction = preparedInstructions[index];
      const signedInstruction = signedInstructions[index];
      if (!preparedInstruction || !signedInstruction) return { index, missing: true };
      const preparedData = Uint8Array.from(preparedInstruction.data);
      const signedData = Uint8Array.from(signedInstruction.data);
      const programIdIndexMatches = preparedInstruction.programIdIndex === signedInstruction.programIdIndex;
      const accountIndexesMatch = JSON.stringify(preparedInstruction.accountKeyIndexes ?? preparedInstruction.accounts)
        === JSON.stringify(signedInstruction.accountKeyIndexes ?? signedInstruction.accounts);
      const dataMatches = preparedData.length === signedData.length
        && preparedData.every((byte, dataIndex) => byte === signedData[dataIndex]);
      return programIdIndexMatches && accountIndexesMatch && dataMatches
        ? null
        : {
          index,
          programIdIndexMatches,
          accountIndexesMatch,
          preparedDataLength: preparedData.length,
          signedDataLength: signedData.length,
          dataMatches,
        };
    }).filter(Boolean);
    const instructionsMatch = instructionDifferences.length === 0;
    let firstDifferentByte = 0;
    while (firstDifferentByte < preparedMessageBytes.length && firstDifferentByte < signedMessageBytes.length
      && preparedMessageBytes[firstDifferentByte] === signedMessageBytes[firstDifferentByte]) firstDifferentByte += 1;
    console.info('[SDU] wallet message comparison', JSON.stringify({
      action,
      messageMatches,
      messageBytes: { prepared: preparedMessageBytes.length, signed: signedMessageBytes.length, firstDifferentByte },
      recentBlockhashMatches: unsigned.message.recentBlockhash === signed.message.recentBlockhash,
      accountKeysMatch,
      accountKeyCounts: { prepared: preparedKeys.length, signed: signedKeys.length },
      changedAccountKeyIndexes,
      instructionCount: { prepared: preparedInstructions.length, signed: signedInstructions.length },
      instructionsMatch,
      instructionDifferences,
    }));
    if (!messageMatches) {
      console.warn('[SDU] wallet returned a different message; submitting for server policy validation', { action, prepareId });
    }
    const signedBytes = signed.serialize();
    const signedBase64 = btoa(Array.from(signedBytes, byte => String.fromCharCode(byte)).join(''));
    console.info('[SDU] submitting signed transaction', { action });
    const response = await this.fetch('/api/sea/scan/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prepareId, profileId, wallet, transaction: signedBase64 }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('[SDU] transaction submit rejected', {
        action,
        status: response.status,
        error: result.error,
        detail: result.detail,
      });
      throw new Error(result.detail || result.error || `HTTP ${response.status}`);
    }
    console.info('[SDU] transaction submit confirmed', { action, signature: result.signature });
    return result;
  }
}