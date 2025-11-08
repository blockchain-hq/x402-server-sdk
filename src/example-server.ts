import express, { Request, Response } from 'express';
import { X402Server } from './server';

const app = express();
const PORT = 3000;

// Your wallet
const YOUR_WALLET = '8qEoLvRsumJpNCn7Q5PT19W5X5g62TKjCaMBDVBpu1hr';

// Initialize x402 server
const x402 = new X402Server({
  recipientAddress: YOUR_WALLET,
  network: 'devnet',
  defaultAmount: '1.0', // 1.0 USDC
  defaultTimeout: 60
});

// Return 402 requiring USDC payment
app.get('/protected', async (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment'];
  
  if (!paymentHeader) {
    const response402 = x402.create402Response({
      resource: '/protected',
      description: 'Access to protected content',
      amount: '1.0' // 1.0 USDC
    });
    
    return res.status(402).json(response402);
  }
  
  // Verify payment
  try {
    const paymentHeaderStr = Array.isArray(paymentHeader) ? paymentHeader[0] : paymentHeader;
    const paymentData = JSON.parse(
      Buffer.from(paymentHeaderStr, 'base64').toString('utf-8')
    );
    
    const verification = await x402.verifyPayment(
      paymentData.payload?.signature || paymentData.signature,
      '1.0'
    );
    
    if (verification.valid) {
      res.json({ 
        content: 'Premium content!',
        payment: {
          amount: verification.amount,
          from: verification.from,
          to: verification.to
        }
      });
    } else {
      const response402 = x402.create402Response({
        resource: '/protected',
        description: 'Access to protected content',
        amount: '1.0',
        error: verification.error || 'Payment verification failed'
      });
      
      res.status(402).json(response402);
    }
  } catch (error) {
    const response402 = x402.create402Response({
      resource: '/protected',
      description: 'Access to protected content',
      amount: '1.0',
      error: `Payment processing error: ${error instanceof Error ? error.message : 'Unknown'}`
    });
    
    res.status(402).json(response402);
  }
});

// Using middleware
app.get('/premium', x402.middleware({
  resource: '/premium',
  description: 'Premium content access',
  amount: '2.0' // 2.0 USDC
}), (req: Request, res: Response) => {
  res.json({ content: 'Premium content accessed!' });
});

app.listen(PORT, () => {
  console.log(`
🚀 Server running: http://localhost:${PORT}

Test it:
  curl -v http://localhost:${PORT}/protected
  curl -v http://localhost:${PORT}/premium

Expected: 402 Payment Required (USDC on Solana Devnet)
  `);
});

// Export the API app instance
export const API = app;
