/**
 * x402 Server SDK - Official Coinbase Protocol Implementation
 * Returns HTTP 402 Payment Required responses following official x402 spec
 * Uses USDC on Solana
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  X402ServerConfig,
  X402PaymentRequirement,
  X402Response,
} from './types';
import {
  SOLANA_DEVNET_RPC,
  SOLANA_MAINNET_RPC,
  USDC_DEVNET_MINT,
  USDC_MAINNET_MINT,
} from './constants';

// USDC Mint Addresses
const USDC_MINT = {
  'devnet': USDC_DEVNET_MINT,
  'mainnet-beta': USDC_MAINNET_MINT
};

export class X402Server {
  private config: Required<X402ServerConfig>;
  private connection: Connection;

  constructor(config: X402ServerConfig) {
    this.config = {
      recipientAddress: config.recipientAddress,
      network: config.network || 'devnet',
      usdcMintAddress: config.usdcMintAddress || USDC_MINT[config.network || 'devnet'],
      defaultAmount: config.defaultAmount || '0.01',
      defaultTimeout: config.defaultTimeout || 60,
      feePayer: config.feePayer || '',
      rpcUrl: config.rpcUrl || (config.network === 'mainnet-beta' ? SOLANA_MAINNET_RPC : SOLANA_DEVNET_RPC)
    };

    // Initialize Solana connection
    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
  }

  /**
   * Create a 402 Payment Required response
   */
  create402Response(options: {
    resource: string;
    description: string;
    amount?: string;              // Amount in USDC (e.g., "0.01")
    mimeType?: string;
    timeout?: number;
    error?: string;
  }): X402Response {
    // Convert USDC to lamports (6 decimals for USDC)
    const amountUSDC = parseFloat(options.amount || this.config.defaultAmount);
    const amountLamports = Math.floor(amountUSDC * 1_000_000).toString();

    const paymentRequirement: X402PaymentRequirement = {
      scheme: 'exact',
      network: `solana-${this.config.network}`,
      maxAmountRequired: amountLamports,
      resource: options.resource,
      description: options.description,
      mimeType: options.mimeType || 'application/json',
      payTo: this.config.recipientAddress,
      maxTimeoutSeconds: options.timeout || this.config.defaultTimeout,
      asset: this.config.usdcMintAddress,
      outputSchema: {
        input: {
          type: 'http',
          method: 'GET',
          discoverable: true
        }
      },
      extra: this.config.feePayer ? {
        feePayer: this.config.feePayer
      } : null
    };

    return {
      x402Version: 1,
      accepts: [paymentRequirement],
      error: options.error
    };
  }

  /**
   * Verify a payment signature on Solana
   */
  async verifyPayment(signature: string, expectedAmount: string): Promise<{
    valid: boolean;
    amount?: number;
    from?: string;
    to?: string;
    error?: string;
  }> {
    try {
      // Get transaction details
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!tx) {
        return {
          valid: false,
          error: 'Transaction not found'
        };
      }

      // Check if transaction was successful
      if (tx.meta?.err) {
        return {
          valid: false,
          error: 'Transaction failed'
        };
      }

      // Parse USDC transfer from transaction
      const preBalances = tx.meta?.preTokenBalances || [];
      const postBalances = tx.meta?.postTokenBalances || [];
      const recipientPubkey = new PublicKey(this.config.recipientAddress);

      // Find USDC transfer to recipient
      let transferAmount = 0;
      let fromAddress = '';
      let toAddress = '';

      for (const post of postBalances) {
        if (post.mint === this.config.usdcMintAddress) {
          const pre = preBalances.find(p => 
            p.accountIndex === post.accountIndex && 
            p.mint === this.config.usdcMintAddress
          );

          const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
          const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
          const diff = postAmount - preAmount;

          if (diff > 0) {
            // Check if this token account belongs to recipient
            const accountIndex = post.accountIndex;
            const accountKey = tx.transaction.message.getAccountKeys().get(accountIndex);
            
            if (accountKey) {
              try {
                const accountInfo = await this.connection.getAccountInfo(accountKey);
                if (accountInfo && accountInfo.data.length >= 64) {
                  // Token account owner is at offset 32-64
                  const ownerBytes = accountInfo.data.slice(32, 64);
                  const ownerPubkey = new PublicKey(ownerBytes);
                  
                  if (ownerPubkey.equals(recipientPubkey)) {
                    transferAmount = diff * 1_000_000; // Convert to lamports (6 decimals)
                    toAddress = this.config.recipientAddress;
                    
                    // Find sender from pre-balances
                    for (const preBal of preBalances) {
                      if (preBal.mint === this.config.usdcMintAddress && 
                          preBal.accountIndex !== accountIndex) {
                        const preBalAmount = parseFloat(preBal.uiTokenAmount.uiAmountString || '0');
                        const postBal = postBalances.find(pb => 
                          pb.accountIndex === preBal.accountIndex && 
                          pb.mint === this.config.usdcMintAddress
                        );
                        const postBalAmount = postBal ? parseFloat(postBal.uiTokenAmount.uiAmountString || '0') : 0;
                        
                        if (preBalAmount > postBalAmount) {
                          // This account sent tokens
                          const senderAccountKey = tx.transaction.message.getAccountKeys().get(preBal.accountIndex);
                          if (senderAccountKey) {
                            const senderAccountInfo = await this.connection.getAccountInfo(senderAccountKey);
                            if (senderAccountInfo && senderAccountInfo.data.length >= 64) {
                              const senderOwnerBytes = senderAccountInfo.data.slice(32, 64);
                              const senderOwnerPubkey = new PublicKey(senderOwnerBytes);
                              fromAddress = senderOwnerPubkey.toBase58();
                            }
                          }
                          break;
                        }
                      }
                    }
                    break;
                  }
                }
              } catch (e) {
                // Continue checking other accounts
                continue;
              }
            }
          }
        }
      }

      // Verify amount matches
      const expectedLamports = Math.floor(parseFloat(expectedAmount) * 1_000_000);
      
      if (transferAmount < expectedLamports) {
        return {
          valid: false,
          error: `Insufficient amount. Expected ${expectedLamports}, got ${transferAmount}`
        };
      }

      return {
        valid: true,
        amount: transferAmount / 1_000_000, // Convert back to USDC
        from: fromAddress,
        to: toAddress
      };

    } catch (error) {
      return {
        valid: false,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Express/HTTP middleware for automatic 402 responses
   */
  middleware(options: {
    resource: string;
    description: string;
    amount?: string;
  }) {
    return async (req: any, res: any, next: any) => {
      const paymentHeader = req.headers['x-payment'];

      if (!paymentHeader) {
        // No payment, return 402
        const response = this.create402Response({
          resource: options.resource,
          description: options.description,
          amount: options.amount
        });

        return res.status(402).json(response);
      }

      try {
        // Parse payment header (base64 encoded JSON)
        const paymentData = JSON.parse(
          Buffer.from(paymentHeader, 'base64').toString('utf-8')
        );

        // Verify payment
        const verification = await this.verifyPayment(
          paymentData.payload?.signature || paymentData.signature,
          options.amount || this.config.defaultAmount
        );

        if (!verification.valid) {
          const response = this.create402Response({
            resource: options.resource,
            description: options.description,
            amount: options.amount,
            error: verification.error || 'Payment verification failed'
          });

          return res.status(402).json(response);
        }

        // Payment valid, continue to resource
        next();

      } catch (error) {
        const response = this.create402Response({
          resource: options.resource,
          description: options.description,
          amount: options.amount,
          error: `Payment processing error: ${error instanceof Error ? error.message : 'Unknown'}`
        });

        return res.status(402).json(response);
      }
    };
  }
}

/**
 * Quick helper to create 402 response
 */
export function create402(
  recipientAddress: string,
  options: {
    resource: string;
    description: string;
    amount?: string;
    network?: 'devnet' | 'mainnet-beta';
  }
): X402Response {
  const server = new X402Server({
    recipientAddress,
    network: options.network
  });

  return server.create402Response({
    resource: options.resource,
    description: options.description,
    amount: options.amount
  });
}
