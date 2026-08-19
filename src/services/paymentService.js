const Stripe = require('stripe');

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is missing');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createPaymentIntent(from, to, amount, metadata = {}) {
  const stripe = getStripeClient();

  const amountInPaise = Math.round(Number(amount) * 100);

  if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
    throw new Error('Invalid payment amount');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPaise,
    currency: process.env.STRIPE_CURRENCY || 'inr',
    metadata: {
      from,
      to,
      ...metadata,
    },
  });

  return {
    provider: 'stripe',
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
  };
}

module.exports = {
  createPaymentIntent,
  getStripeClient,
};
