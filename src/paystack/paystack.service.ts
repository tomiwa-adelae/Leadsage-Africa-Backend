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
  authorizationCode: string | null; // saved card token for recurring charges
  customerEmail: string | null;
}

interface ChargeAuthResponse {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  reference: string;
  amount: number; // in kobo
  id: number;
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
      authorizationCode: data.authorization?.authorization_code ?? null,
      customerEmail: data.customer?.email ?? null,
    };
  }

  /**
   * Charge a previously authorized card without requiring user interaction.
   * Use `authorization_code` saved from a prior successful transaction.
   */
  async chargeAuthorization(
    authorizationCode: string,
    email: string,
    amountNGN: number,
    metadata: Record<string, any>,
    reference?: string,
  ): Promise<ChargeAuthResponse> {
    const data = await this.request<any>('POST', '/transaction/charge_authorization', {
      authorization_code: authorizationCode,
      email,
      amount: Math.round(amountNGN * 100),
      metadata,
      ...(reference ? { reference } : {}),
    });

    return {
      status: data.status,
      reference: data.reference,
      amount: data.amount,
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
   * Create a transfer recipient on Paystack.
   * Returns the recipient_code used to initiate the transfer.
   */
  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<string> {
    const data = await this.request<{ recipient_code: string }>(
      'POST',
      '/transferrecipient',
      {
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      },
    );
    return data.recipient_code;
  }

  /**
   * Initiate a Paystack transfer to a recipient.
   * Paystack debits the business Paystack balance.
   */
  async initiatePaystackTransfer(
    recipientCode: string,
    amountNGN: number,
    reason: string,
    reference: string,
  ): Promise<void> {
    await this.request<any>('POST', '/transfer', {
      source: 'balance',
      amount: Math.round(amountNGN * 100), // kobo
      recipient: recipientCode,
      reason: reason.slice(0, 100),
      reference,
    });
  }

  /**
   * Resolve a Nigerian bank account to get the account holder's name.
   * Uses CBN bank codes (same as our BANKS list in the frontend).
   * Paystack charges nothing for this — it's a free NIBSS lookup.
   */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string; accountNumber: string }> {
    const data = await this.request<{ account_name: string; account_number: string }>(
      'GET',
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    );
    return {
      accountName: data.account_name,
      accountNumber: data.account_number,
    };
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
