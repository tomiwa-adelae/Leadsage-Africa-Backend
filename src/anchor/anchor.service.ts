import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

const ANCHOR_BASE =
  process.env.ANCHOR_BASE_URL ?? 'https://api.sandbox.getanchor.co';

@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'x-anchor-key': process.env.ANCHOR_SECRET_KEY ?? '',
    };
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${ANCHOR_BASE}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      this.logger.error(`Anchor ${method} ${path} → ${res.status}: ${text}`);
      throw new Error(
        json?.errors?.[0]?.detail ??
          json?.message ??
          `Anchor error ${res.status}`,
      );
    }
    return json as T;
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  private sanitizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('234') && clean.length > 10) {
      clean = '0' + clean.slice(3);
    }
    return clean || '08000000000';
  }

  async findCustomerByEmail(email: string): Promise<string | null> {
    try {
      const data = await this.request<any>(
        'GET',
        `/api/v1/customers?email=${encodeURIComponent(email)}`,
      );
      const customers = data?.data ?? [];
      return customers[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  async createOrFetchCustomer(params: {
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
    phoneNumber: string;
    address?: {
      addressLine_1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
  }): Promise<string> {
    try {
      const data = await this.request<any>('POST', '/api/v1/customers', {
        data: {
          type: 'IndividualCustomer',
          attributes: {
            fullName: {
              firstName: params.firstName || 'User',
              lastName: params.lastName || 'Customer',
              middleName: params.middleName ?? '',
            },
            email: params.email,
            phoneNumber: this.sanitizePhone(params.phoneNumber),
            address: {
              addressLine_1:
                params.address?.addressLine_1 ?? '1 Street Address',
              city: params.address?.city ?? 'Lagos',
              state: params.address?.state ?? 'Lagos',
              country: 'NG',
              postalCode: params.address?.postalCode ?? '100001',
            },
          },
        },
      });
      return data?.data?.id as string;
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('already exist')) {
        this.logger.log(
          `Customer already exists in Anchor, fetching by email: ${params.email}`,
        );
        const existingId = await this.findCustomerByEmail(params.email);
        if (existingId) return existingId;
      }
      throw err;
    }
  }

  // ── BVN verification ────────────────────────────────────────────────────────

  async verifyBvn(
    customerId: string,
    params: {
      bvn: string;
      dateOfBirth: string; // YYYY-MM-DD
      gender: 'Male' | 'Female';
    },
  ) {
    console.log(
      'BVN',
      params.bvn,
      'DOB',
      params.dateOfBirth,
      'Gender',
      params.gender,
    );
    return this.request(
      'POST',
      `/api/v1/customers/${customerId}/verification/individual`,
      {
        data: {
          type: 'Verification',
          attributes: {
            level: 'TIER_2',
            level2: {
              bvn: params.bvn,
              dateOfBirth: params.dateOfBirth,
              gender: params.gender,
            },
          },
        },
      },
    );
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  async createDepositAccount(customerId: string): Promise<{
    id: string;
    accountNumber: string | null;
    accountName: string | null;
    bankName: string | null;
    bankCode: string | null;
  }> {
    const data = await this.request<any>('POST', '/api/v1/accounts', {
      data: {
        type: 'DepositAccount',
        attributes: { productName: 'SAVINGS' },
        relationships: {
          customer: {
            data: { type: 'Customer', id: customerId },
          },
        },
      },
    });

    const accountId = data?.data?.id as string;

    // Account number is assigned asynchronously by Anchor.
    // Caller must use pollVirtualNubans() to retrieve it after creation.
    return {
      id: accountId,
      accountNumber: null,
      accountName: null,
      bankName: null,
      bankCode: null,
    };
  }

  async getCustomer(customerId: string): Promise<any> {
    return this.request<any>('GET', `/api/v1/customers/${customerId}`);
  }

  /**
   * Returns the customer's current KYC tier string as-is from Anchor,
   * e.g. "TIER_0", "TIER_1", "TIER_2", "TIER_3", or "" if unknown.
   * Also checks identityVerification.status for APIs that use that field.
   */
  async getCustomerTier(
    customerId: string,
  ): Promise<{ tier: string; verified: boolean }> {
    try {
      const data = await this.getCustomer(customerId);
      const attrs = data?.data?.attributes ?? {};

      // Log raw attrs so we can see exactly what Anchor returns
      this.logger.log(`Anchor customer attrs: ${JSON.stringify(attrs)}`);

      // Live Anchor: KYC data lives under attrs.verification.level / .status
      const tier: string = attrs?.verification?.level ?? attrs?.tier ?? '';
      const verificationStatus: string =
        attrs?.verification?.status ??
        attrs?.identityVerification?.status ??
        attrs?.verificationStatus ??
        '';

      const tierNorm = tier.replace(/[\s_]/g, '').toUpperCase(); // "TIER2"
      const statusNorm = verificationStatus.toUpperCase();

      const verified =
        tierNorm === 'TIER2' ||
        tierNorm === 'TIER3' ||
        statusNorm === 'APPROVED' ||
        statusNorm === 'VERIFIED' ||
        statusNorm === 'SUCCESSFUL';

      return { tier, verified };
    } catch {
      return { tier: '', verified: false };
    }
  }

  /**
   * Poll until the customer's KYC tier reaches TIER_2 (BVN verified).
   * Returns true if verified within the timeout, false if still pending.
   * Live Anchor processes BVN asynchronously — this bridges the gap.
   */
  async pollCustomerKycVerified(
    customerId: string,
    attempts = 20,
    delayMs = 3000,
  ): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await this.getCustomer(customerId);
        const attrs = data?.data?.attributes ?? {};

        const tier: string = attrs?.verification?.level ?? attrs?.tier ?? '';
        const verificationStatus: string =
          attrs?.verification?.status ??
          attrs?.identityVerification?.status ??
          attrs?.verificationStatus ??
          '';

        const tierNorm = tier.replace(/[\s_]/g, '').toUpperCase();
        const statusNorm = verificationStatus.toUpperCase();

        if (
          tierNorm === 'TIER2' ||
          tierNorm === 'TIER3' ||
          statusNorm === 'APPROVED' ||
          statusNorm === 'VERIFIED' ||
          statusNorm === 'SUCCESSFUL'
        ) {
          return true;
        }

        if (statusNorm === 'FAILED' || statusNorm === 'REJECTED') {
          return false;
        }
      } catch {
        // ignore transient fetch errors during polling
      }

      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  async getAccountNumbers(accountId: string): Promise<any[]> {
    try {
      const res = await this.request<any>(
        'GET',
        `/api/v1/account-numbers?AccountId=${accountId}`,
      );
      return res?.data ?? [];
    } catch {
      return [];
    }
  }

  async getAccount(accountId: string) {
    return this.request<any>('GET', `/api/v1/accounts/${accountId}`);
  }

  async getAccountsByCustomer(customerId: string) {
    return this.request<any>(
      'GET',
      `/api/v1/accounts?customerId=${customerId}`,
    );
  }

  async getAccountBalance(accountId: string): Promise<number> {
    const data = await this.getAccount(accountId);
    const attrs = data?.data?.attributes ?? {};
    // Anchor returns balances in kobo; availableBalance is the spendable amount
    const kobo: number =
      attrs?.availableBalance ??
      attrs?.balance ??
      0;
    return kobo / 100;
  }

  async pollVirtualNubans(
    accountId: string,
    attempts = 6,
    delayMs = 3000,
  ): Promise<{
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  } | null> {
    for (let i = 0; i < attempts; i++) {
      const numbers = await this.getAccountNumbers(accountId);
      const attrs = numbers?.[0]?.attributes;
      if (attrs?.accountNumber) {
        return {
          accountNumber: attrs.accountNumber,
          accountName: attrs.name ?? attrs.accountName ?? null,
          bankName: attrs.bank?.name ?? null,
          bankCode: attrs.bank?.code ?? null,
        };
      }
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }

  // ── Transfers ───────────────────────────────────────────────────────────────

  async createCounterparty(params: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }) {
    const data = await this.request<any>('POST', '/api/v1/counterparties', {
      data: {
        type: 'Counterparty',
        attributes: {
          bankCode: params.bankCode,
          accountNumber: params.accountNumber,
          accountName: params.accountName,
        },
      },
    });
    return data?.data?.id as string;
  }

  async initiateTransfer(params: {
    accountId: string;
    counterpartyId: string;
    amountNaira: number;
    reference: string;
    reason: string;
  }) {
    return this.request<any>('POST', '/api/v1/transfers', {
      amount: Math.round(params.amountNaira * 100),
      currency: 'NGN',
      reason: params.reason.slice(0, 100),
      reference: params.reference,
      account: { id: params.accountId },
      counterParty: { id: params.counterpartyId },
    });
  }

  async internalTransfer(params: {
    fromAccountId: string;
    toAccountId: string;
    amountNaira: number;
    reference?: string;
    reason?: string;
  }) {
    return this.request<any>('POST', '/api/v1/transfers', {
      data: {
        type: 'BookTransfer',
        attributes: {
          amount: Math.round(params.amountNaira * 100),
          currency: 'NGN',
          reason: (params.reason ?? 'Internal transfer').slice(0, 100),
          reference: params.reference ?? uuidv4(),
        },
        relationships: {
          account: {
            data: { id: params.fromAccountId, type: 'DepositAccount' },
          },
          destinationAccount: {
            data: { id: params.toAccountId, type: 'DepositAccount' },
          },
        },
      },
    });
  }

  async getBanks() {
    return this.request<any>('GET', '/api/v1/banks');
  }

  async verifyAccount(bankCode: string, accountNumber: string) {
    return this.request<any>(
      'GET',
      `/api/v1/payments/verify-account/${bankCode}/${accountNumber}`,
    );
  }
}
