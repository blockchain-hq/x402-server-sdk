# x402 Server SDK

Server-side SDK for the x402 payment protocol on Solana. Returns HTTP 402 Payment Required responses following the official x402 spec. Uses USDC on Solana Devnet.

[![npm version](https://badge.fury.io/js/x402-server-sdk.svg)](https://www.npmjs.com/package/x402-server-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Return 402 Payment Required responses following official x402 spec
- Verify USDC payments on-chain
- Support for USDC on Solana Devnet and Mainnet
- Express middleware support
- Prevent replay attacks
- TypeScript support

## Installation

```bash
npm install x402-server-sdk
```

## Quick Start

```typescript
import { X402Server } from 'x402-server-sdk';

const server = new X402Server({
  recipientAddress: 'YOUR_WALLET_ADDRESS',
  network: 'devnet',
  defaultAmount: '1.0', // 1.0 USDC
  defaultTimeout: 60
});

// Return 402 when payment needed
app.get('/premium', async (req, res) => {
  const payment = req.headers['x-payment'];
  
  if (!payment) {
    const response402 = server.create402Response({
      resource: '/premium',
      description: 'Access to premium content',
      amount: '1.0' // 1.0 USDC
    });
    return res.status(402).json(response402);
  }
  
  // Verify payment
  const paymentData = JSON.parse(
    Buffer.from(payment, 'base64').toString('utf-8')
  );
  
  const verification = await server.verifyPayment(
    paymentData.payload?.signature || paymentData.signature,
    '1.0'
  );
  
  if (verification.valid) {
    res.json({ content: 'Premium content!' });
  } else {
    const response402 = server.create402Response({
      resource: '/premium',
      description: 'Access to premium content',
      amount: '1.0',
      error: verification.error
    });
    res.status(402).json(response402);
  }
});
```

## Using Middleware

```typescript
import { X402Server } from 'x402-server-sdk';

const server = new X402Server({
  recipientAddress: 'YOUR_WALLET_ADDRESS',
  network: 'devnet'
});

// Automatic 402 handling with middleware
app.get('/premium', server.middleware({
  resource: '/premium',
  description: 'Premium content access',
  amount: '2.0' // 2.0 USDC
}), (req, res) => {
  res.json({ content: 'Premium content!' });
});
```

## API

### Constructor

```typescript
new X402Server({
  recipientAddress: string,          // Your Solana wallet address
  network?: 'devnet' | 'mainnet-beta', // Solana network (default: 'devnet')
  usdcMintAddress?: string,          // USDC mint address (optional, uses defaults)
  defaultAmount?: string,            // Default amount in USDC (default: '0.01')
  defaultTimeout?: number,           // Default timeout in seconds (default: 60)
  feePayer?: string,                 // Optional fee payer address
  rpcUrl?: string                    // Optional custom RPC URL
})
```

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `create402Response(options)` | Create 402 response | `X402Response` |
| `verifyPayment(signature, expectedAmount)` | Verify USDC payment | `Promise<{valid, amount?, from?, to?, error?}>` |
| `middleware(options)` | Express middleware for automatic 402 handling | `(req, res, next) => void` |

### Response Format

The SDK returns responses following the official x402 spec:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "1000000",
      "resource": "/premium",
      "description": "Access to premium content",
      "mimeType": "application/json",
      "payTo": "YOUR_WALLET_ADDRESS",
      "maxTimeoutSeconds": 60,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "outputSchema": {
        "input": {
          "type": "http",
          "method": "GET",
          "discoverable": true
        }
      },
      "extra": null
    }
  ],
  "error": "X-PAYMENT header is required"
}
```

## Helper Function

```typescript
import { create402 } from 'x402-server-sdk';

// Quick helper to create 402 response
const response = create402('YOUR_WALLET_ADDRESS', {
  resource: '/premium',
  description: 'Premium content',
  amount: '1.0',
  network: 'devnet'
});
```

## Networks

**Devnet:**
```typescript
const server = new X402Server({
  recipientAddress: 'YOUR_DEVNET_WALLET',
  network: 'devnet',
});
```

**Mainnet:**
```typescript
const server = new X402Server({
  recipientAddress: 'YOUR_MAINNET_WALLET',
  network: 'mainnet-beta',
});
```

## Security

```typescript
// Verify payment with amount check
const verification = await server.verifyPayment(
  signature,
  '1.0' // Expected amount in USDC
);

if (!verification.valid) {
  // Handle invalid payment
  return res.status(402).json({
    error: verification.error
  });
}

// Store used signatures in database to prevent replay attacks
if (await db.isSignatureUsed(signature)) {
  return res.status(403).json({ error: 'Payment already used' });
}
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| Transaction not found | Wait a few seconds, check network |
| Insufficient amount | Verify exact amount (tolerance: 0.0001 USDC) |
| Transaction failed | Check transaction on Solana explorer |
| No USDC transfer found | Verify transaction contains USDC transfer to recipient |
| Payment processing error | Check X-PAYMENT header format (base64 encoded JSON) |

## Documentation

Full documentation: [docs.x402.org](https://docs.x402.org)

## License

MIT

## Contributing

Issues and PRs welcome!

## Support

- [GitHub Issues](https://github.com/YOUR_USERNAME/x402-server-sdk/issues)
- [Discord](https://discord.gg/YOUR_DISCORD)

---

Made with love for Solana and x402 Protocol
