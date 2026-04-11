export const PasswordResetEmail = ({
  firstName,
  newPassword,
}: {
  firstName: string;
  newPassword: string;
}) => {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Staxis Password Has Been Reset</title>
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
              <td style="padding:40px;text-align:center;">
                <h2 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0f172a;">Your Password Has Been Reset</h2>
                <p style="margin:0 0 32px 0;font-size:15px;color:#475569;line-height:1.7;">
                  Hello ${firstName}, an administrator has reset your Staxis account password.<br/>
                  Use the temporary password below to log in, then change it immediately.
                </p>

                <!-- Password Box -->
                <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 12px auto;">
                  <tr>
                    <td style="background-color:#f8fafc;border:2px dashed #f59e0b;border-radius:8px;padding:24px 40px;text-align:center;">
                      <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Temporary Password</p>
                      <p style="margin:0;font-size:26px;font-weight:700;color:#0f172a;font-family:'Courier New',monospace;letter-spacing:3px;">${newPassword}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 32px 0;font-size:12px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">
                  Please change your password after logging in
                </p>

                <!-- CTA -->
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="${process.env.FRONTEND_URL}/auth"
                        style="display:inline-block;padding:14px 36px;background-color:#f59e0b;color:#0f172a;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;letter-spacing:0.5px;text-transform:uppercase;">
                        Log In to Staxis
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:32px 0 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                  If you did not expect this change, please contact our support team immediately.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 6px 0;font-size:11px;color:#94a3b8;text-align:center;">
                  &copy; ${new Date().getFullYear()} Zionstand Digital Technologies Limited &nbsp;|&nbsp; RC: 7676055
                </p>
                <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                  This is an automated notification. Do not reply to this email.<br/>
                  Need help? <a href="mailto:${process.env.SUPPORT_EMAIL_ADDRESS}" style="color:#f59e0b;text-decoration:none;">Contact Support</a>
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
