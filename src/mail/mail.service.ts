import { Injectable, Logger } from '@nestjs/common';
import Mailjet from 'node-mailjet';

const SENDER_NAME = 'Leadsage Africa';

@Injectable()
export class MailService {
  private readonly mailjet: ReturnType<typeof Mailjet.apiConnect>;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.mailjet = Mailjet.apiConnect(
      process.env.MAILJET_API_PUBLIC_KEY!,
      process.env.MAILJET_API_PRIVATE_KEY!,
    );
  }

  /** Send an email to a single recipient, with optional PDF attachment. */
  async sendMail({
    toEmail,
    toName,
    subject,
    html,
    attachment,
  }: {
    toEmail: string;
    toName: string;
    subject: string;
    html: string;
    attachment?: { filename: string; base64Content: string };
  }): Promise<void> {
    try {
      await this.mailjet.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: process.env.SENDER_EMAIL_ADDRESS,
              Name: SENDER_NAME,
            },
            To: [{ Email: toEmail, Name: toName }],
            Subject: subject,
            HTMLPart: html,
            ...(attachment
              ? {
                  Attachments: [
                    {
                      ContentType: 'application/pdf',
                      Filename: attachment.filename,
                      Base64Content: attachment.base64Content,
                    },
                  ],
                }
              : {}),
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${toEmail}: ${err}`);
    }
  }

  /** Send emails to multiple recipients in batches of 50. */
  async sendBulkMail({
    recipients,
    subject,
    html,
    attachments,
  }: {
    recipients: { email: string; name: string }[];
    subject: string;
    html: string;
    attachments?: { filename: string; contentType: string; base64Content: string }[]; // matches AttachmentDto
  }): Promise<{ sent: number; failed: number }> {
    const BATCH_SIZE = 50;
    let sent = 0;
    let failed = 0;

    const mjAttachments = attachments?.length
      ? attachments.map((a) => ({
          ContentType: a.contentType,
          Filename: a.filename,
          Base64Content: a.base64Content,
        }))
      : undefined;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      try {
        await this.mailjet.post('send', { version: 'v3.1' }).request({
          Messages: batch.map((r) => ({
            From: {
              Email: process.env.SENDER_EMAIL_ADDRESS,
              Name: SENDER_NAME,
            },
            To: [{ Email: r.email, Name: r.name }],
            Subject: subject,
            HTMLPart: html,
            ...(mjAttachments ? { Attachments: mjAttachments } : {}),
          })),
        });
        sent += batch.length;
      } catch (err) {
        this.logger.error(`Bulk send batch ${i}–${i + batch.length} failed: ${err}`);
        failed += batch.length;
      }
    }

    return { sent, failed };
  }

  /** Send an email to the admin (reads ADMIN_EMAIL_ADDRESS from env). */
  async sendAdminMail({
    subject,
    html,
  }: {
    subject: string;
    html: string;
  }): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL_ADDRESS;
    if (!adminEmail) {
      this.logger.warn('ADMIN_EMAIL_ADDRESS not set skipping admin email');
      return;
    }
    await this.sendMail({
      toEmail: adminEmail,
      toName: 'Leadsage Admin',
      subject,
      html,
    });
  }
}
