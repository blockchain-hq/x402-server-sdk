export interface X402PaymentRequirement {
  scheme: string;                    // "exact"
  network: string;                   // "solana-devnet" or "solana-mainnet"
  maxAmountRequired: string;         // Amount in smallest units (lamports for USDC = 6 decimals)
  resource: string;                  // URL of the resource
  description: string;               // Human-readable description
  mimeType: string;                  // Response MIME type
  payTo: string;                     // Recipient Solana address
  maxTimeoutSeconds: number;         // Maximum timeout
  asset: string;                     // USDC mint address
  outputSchema?: object | null;      // Optional output schema
  extra?: {                          // Optional extra data
    feePayer?: string;               // Optional fee payer
    [key: string]: any;
  } | null;
}

export interface X402Response {
  x402Version: number;               // Protocol version (always 1)
  accepts: X402PaymentRequirement[]; // Payment options
  error?: string;                    // Optional error message
}

export interface X402ServerConfig {
  recipientAddress: string;          // Your Solana wallet address
  network?: 'devnet' | 'mainnet-beta'; // Solana network
  usdcMintAddress?: string;          // USDC mint address (optional, uses defaults)
  defaultAmount?: string;            // Default amount in USDC (e.g., "0.01")
  defaultTimeout?: number;           // Default timeout in seconds
  feePayer?: string;                 // Optional fee payer address
  rpcUrl?: string;                   // Optional custom RPC URL
}
