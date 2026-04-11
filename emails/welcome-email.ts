export const WelcomeEmail = ({ firstName }: { firstName: string }) => {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Staxis</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">

            <!-- Header -->
            <tr>
              <td style="background-color:#0f172a;padding:36px 40px;text-align:center;">
                <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:4px;color:#f59e0b;text-transform:uppercase;">Zionstand Digital Technologies</p>
                <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">STAXIS</h1>
                <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;letter-spacing:1px;">Managed Digital Support</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#0f172a;">Welcome aboard, ${firstName}!</h2>
                <p style="margin:0 0 16px 0;font-size:15px;color:#475569;line-height:1.7;">
                  Your Staxis account has been created successfully. You're now part of a growing community of businesses who trust us with their digital infrastructure, IT support, and data intelligence.
                </p>
                <p style="margin:0 0 32px 0;font-size:15px;color:#475569;line-height:1.7;">
                  The next step is to complete your onboarding set up your company profile and choose a care plan that fits your needs.
                </p>

                <!-- CTA -->
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="${process.env.FRONTEND_URL}/onboarding"
                        style="display:inline-block;padding:14px 36px;background-color:#f59e0b;color:#0f172a;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;letter-spacing:0.5px;text-transform:uppercase;">
                        Complete Your Onboarding
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Divider -->
                <table cellpadding="0" cellspacing="0" width="100%" style="margin:36px 0;">
                  <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
                </table>

                <!-- What's next -->
                <p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">What Happens Next</p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:10px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:28px;height:28px;background-color:#fef3c7;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:800;color:#d97706;">1</td>
                          <td style="padding-left:12px;font-size:14px;color:#475569;">Set up your company profile</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:28px;height:28px;background-color:#fef3c7;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:800;color:#d97706;">2</td>
                          <td style="padding-left:12px;font-size:14px;color:#475569;">Choose your care plan (Web, IT, or Data Intelligence)</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:28px;height:28px;background-color:#fef3c7;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:800;color:#d97706;">3</td>
                          <td style="padding-left:12px;font-size:14px;color:#475569;">Complete payment and activate your subscription</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <p style="margin:32px 0 0 0;font-size:14px;color:#64748b;line-height:1.6;">
                  If you need any help during onboarding, reply to this email or reach out to our support team we're here for you.
                </p>
                <p style="margin:20px 0 0 0;font-size:14px;color:#0f172a;font-weight:600;">The Staxis Team</p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 6px 0;font-size:11px;color:#94a3b8;text-align:center;">
                  &copy; ${new Date().getFullYear()} Zionstand Digital Technologies Limited &nbsp;|&nbsp; RC: 7676055
                </p>
                <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                  If you did not create this account, please
                  <a href="mailto:${process.env.SUPPORT_EMAIL_ADDRESS}" style="color:#f59e0b;text-decoration:none;">contact support</a>.
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
