import { Injectable, InternalServerErrorException } from '@nestjs/common';

const PAYSTACK_BASE = 'https://api.paystack.co';

interface InitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

interface VerifyResponse {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  reference: string;
  amount: number; // in kobo
  paidAt: string | null;
  metadata: Record<string, any>;
  id: number; // Paystack transaction ID (for refund)
}

@Injectable()
export class PaystackService {
  private get secret() {
    return process.env.PAYSTACK_SECRET_KEY ?? '';
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.secret}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const res = await fetch(`${PAYSTACK_BASE}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const json: any = await res.json();

    if (!res.ok || !json.status) {
      throw new InternalServerErrorException(
        json.message ?? 'Paystack request failed',
      );
    }

    return json.data as T;
  }

  /**
   * Initialize a transaction. Returns the authorization URL to redirect the
   * user to, along with the reference to store on the booking.
   *
   * @param email     Customer email
   * @param amountNGN Amount in NGN (we convert to kobo internally)
   * @param metadata  Arbitrary key-value data stored on the transaction
   * @param callbackUrl  Where Paystack redirects after payment
   */
  async initializeTransaction(
    email: string,
    amountNGN: number,
    metadata: Record<string, any>,
    callbackUrl: string,
    reference?: string,
  ): Promise<InitResponse> {
    const data = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('POST', '/transaction/initialize', {
      email,
      amount: Math.round(amountNGN * 100), // kobo
      metadata,
      callback_url: callbackUrl,
      ...(reference ? { reference } : {}),
    });

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  /**
   * Verify a transaction by reference. Call this from the webhook or
   * the callback page to confirm payment.
   */
  async verifyTransaction(reference: string): Promise<VerifyResponse> {
    const data = await this.request<any>(
      'GET',
      `/transaction/verify/${reference}`,
    );

    return {
      status: data.status,
      reference: data.reference,
      amount: data.amount, // kobo
      paidAt: data.paid_at ?? null,
      metadata: data.metadata ?? {},
      id: data.id,
    };
  }

  /**
   * Refund a transaction. Pass `amountNGN` for partial refund; omit for full.
   */
  async refundTransaction(
    transactionId: number,
    amountNGN?: number,
  ): Promise<{ status: string }> {
    const body: Record<string, any> = { transaction: transactionId };
    if (amountNGN !== undefined) {
      body.amount = Math.round(amountNGN * 100);
    }
    const data = await this.request<{ status: string }>('POST', '/refund', body);
    return data;
  }

  /**
   * Verify that a webhook request is genuinely from Paystack by checking
   * the HMAC-SHA512 signature in the `x-paystack-signature` header.
   */
  async verifyWebhookSignature(
    payload: Buffer,
    signature: string,
  ): Promise<boolean> {
    const { createHmac } = await import('crypto');
    const hash = createHmac('sha512', this.secret)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }
}
