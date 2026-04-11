export const ListingRejectedEmail = ({
  firstName,
  listingTitle,
  reason,
  editUrl,
}: {
  firstName: string;
  listingTitle: string;
  reason: string;
  editUrl: string;
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Action required on your listing</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">

            <!-- Header -->
            <tr>
              <td style="background-color:#0f172a;padding:36px 40px;text-align:center;">
                <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:1px;">LEADSAGE AFRICA</h1>
                <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;letter-spacing:1px;">Your trusted property marketplace</p>
              </td>
            </tr>

            <!-- Red banner -->
            <tr>
              <td style="background-color:#fef2f2;padding:20px 40px;border-bottom:1px solid #fecaca;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="width:40px;vertical-align:middle;">
                      <div style="width:36px;height:36px;background-color:#dc2626;border-radius:50%;text-align:center;line-height:36px;font-size:18px;color:#ffffff;">!</div>
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <p style="margin:0;font-size:15px;font-weight:700;color:#b91c1c;">Your listing needs attention</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <p style="margin:0 0 16px 0;font-size:15px;color:#1e293b;">Hi ${firstName},</p>
                <p style="margin:0 0 16px 0;font-size:15px;color:#475569;line-height:1.7;">
                  Our moderation team reviewed your listing and requires some changes before it can go live.
                </p>

                <!-- Listing card -->
                <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 20px;background-color:#f8fafc;">
                      <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Listing</p>
                      <p style="margin:4px 0 0 0;font-size:16px;font-weight:700;color:#0f172a;">${listingTitle}</p>
                    </td>
                  </tr>
                </table>

                <!-- Reason box -->
                <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 20px;background-color:#fef2f2;">
                      <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Reason for rejection</p>
                      <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;">${reason}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 24px 0;font-size:15px;color:#475569;line-height:1.7;">
                  Please update your listing based on the feedback above and resubmit for review.
                  Our team will review it again within <strong>24–48 hours</strong>.
                </p>

                <!-- CTA -->
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="${editUrl}"
                        style="display:inline-block;padding:14px 36px;background-color:#dc2626;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;">
                        Update My Listing
                      </a>
                    </td>
                  </tr>
                </table>

                <table cellpadding="0" cellspacing="0" width="100%" style="margin:32px 0;">
                  <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
                </table>

                <p style="margin:0 0 8px 0;font-size:14px;color:#475569;line-height:1.7;">
                  If you believe this rejection was made in error or need clarification, reply to this email
                  or contact our support team.
                </p>
                <p style="margin:16px 0 0 0;font-size:14px;color:#0f172a;font-weight:600;">The Leadsage Team</p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                  &copy; ${new Date().getFullYear()} Leadsage Africa &nbsp;|&nbsp; Nigeria's trusted property marketplace
                </p>
                <p style="margin:6px 0 0 0;font-size:11px;color:#94a3b8;text-align:center;">
                  Questions? <a href="mailto:${process.env.SUPPORT_EMAIL_ADDRESS}" style="color:#0f172a;text-decoration:none;">Contact support</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};
