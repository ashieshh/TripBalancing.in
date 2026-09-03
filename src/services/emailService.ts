import nodemailer from "nodemailer";

// Configuration defaults with Brevo SMTP details
const SMTP_HOST = process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || "587", 10);
const SMTP_USER = process.env.BREVO_SMTP_USER || "";
const SMTP_PASS = process.env.BREVO_SMTP_PASS || process.env.BREVO_API_KEY || "";

const DEFAULT_FROM = process.env.SMTP_FROM || "TripBalancing <noreply@tripbalancing.in>";
const DEFAULT_REPLY_TO = process.env.SMTP_REPLY_TO || "support@tripbalancing.in";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!transporter && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for other ports like 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Sends an email using Brevo SMTP.
 * If credentials are missing, logs the payload safely to console in simulation mode.
 */
export async function sendBrevoEmail(options: SendEmailOptions) {
  const mailTransporter = getTransporter();

  const mailOptions = {
    from: DEFAULT_FROM,
    replyTo: options.replyTo || DEFAULT_REPLY_TO,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]+>/g, " ").trim(),
  };

  if (!mailTransporter) {
    console.log(`[Email Service Simulation] Brevo credentials not set. Simulating email to: ${options.to}`);
    console.log(`[Subject]: ${options.subject}`);
    return {
      success: true,
      simulated: true,
      messageId: `simulated_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`[Brevo SMTP Success] Email sent to ${options.to}. MessageID: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error(`[Brevo SMTP Error] Failed to send email to ${options.to}:`, error);
    throw error;
  }
}

// ==============================================================================
// Responsive HTML Email Template Builders
// ==============================================================================

const COMMON_HEADER = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TripBalancing</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; -webkit-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header-bar { background: linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%); padding: 32px 24px; text-align: center; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
    .header-subtitle { color: #ccfbf1; font-size: 13px; font-weight: 600; margin-top: 6px; text-transform: uppercase; letter-spacing: 1px; }
    .content-body { padding: 32px 28px; }
    .card-box { background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .btn-primary { display: inline-block; background-color: #14b8a6; color: #0f172a !important; font-weight: 800; font-size: 14px; padding: 14px 28px; text-decoration: none; border-radius: 10px; text-align: center; margin: 20px 0; }
    .btn-primary:hover { background-color: #2dd4bf; }
    .data-table { width: 100%; margin-top: 12px; }
    .data-table td { padding: 10px 0; border-bottom: 1px solid #334155; font-size: 14px; }
    .data-label { color: #94a3b8; font-weight: 600; width: 40%; }
    .data-value { color: #f8fafc; font-weight: 700; text-align: right; }
    .footer { background-color: #0f172a; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
    .footer a { color: #14b8a6; text-decoration: none; }
  </style>
</head>
<body style="background-color: #0f172a; padding: 20px 10px;">
  <div class="email-container">
    <div class="header-bar">
      <h1 class="header-title">TripBalancing</h1>
      <div class="header-subtitle">AI-Powered Travel Intelligence</div>
    </div>
    <div class="content-body">
`;

const COMMON_FOOTER = `
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #94a3b8;">TripBalancing Technologies</p>
      <p style="margin: 0 0 12px 0;">Empowering smart, balanced, and unforgettable journeys worldwide.</p>
      <p style="margin: 0;">Need help? Reply directly or contact <a href="mailto:support@tripbalancing.in">support@tripbalancing.in</a></p>
    </div>
  </div>
</body>
</html>
`;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateReviewNotificationEmail(data: {
  reviewerEmail: string;
  destination: string;
  rating: number;
  reviewText: string;
  tripId: string;
}) {
  const destination = escapeHtml(data.destination);
  const reviewerEmail = escapeHtml(data.reviewerEmail);
  const reviewText = escapeHtml(data.reviewText).replace(/\n/g, "<br />");
  const rating = Math.max(1, Math.min(5, Math.round(data.rating)));
  const tripId = escapeHtml(data.tripId);
  const html = `
    ${COMMON_HEADER}
      <h2 style="color:#f8fafc;font-size:20px;margin-top:0;">New traveler experience received</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">A traveler submitted a review for <strong>${destination}</strong>.</p>
      <div class="card-box">
        <table class="data-table">
          <tr><td class="data-label">Rating</td><td class="data-value" style="color:#fbbf24;">${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5)</td></tr>
          <tr><td class="data-label">Traveler</td><td class="data-value">${reviewerEmail}</td></tr>
          <tr><td class="data-label">Trip ID</td><td class="data-value" style="font-family:monospace;">${tripId}</td></tr>
        </table>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #334155;color:#cbd5e1;font-size:14px;line-height:1.6;">${reviewText}</div>
      </div>
      <p style="color:#94a3b8;font-size:12px;">Private trip notes are not included in review notifications.</p>
    ${COMMON_FOOTER}
  `;
  return { subject: `New ${rating}-star review for ${data.destination}`, html };
}

// 1. Welcome Email
export function generateWelcomeEmail(userName: string, appUrl: string = "https://tripbalancing.in") {
  const name = userName || "Traveler";
  const html = `
    ${COMMON_HEADER}
      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0;">Welcome to TripBalancing, ${name}! ✈️</h2>
      <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Your email has been successfully verified. You now have full access to create hyper-personalized AI itineraries, balance budget versus pacing, and collaborate seamlessly with travel buddies.</p>

      <div class="card-box">
        <h3 style="color: #14b8a6; font-size: 15px; font-weight: 700; margin: 0 0 10px 0;">What you can do next:</h3>
        <ul style="color: #94a3b8; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Generate custom trip plans based on your preferred travel vibe</li>
          <li>Real-time weather forecast insights for your destination</li>
          <li>Export itineraries to PDF and share buddy links</li>
        </ul>
      </div>

      <div style="text-align: center;">
        <a href="${appUrl}" class="btn-primary" target="_blank">Start Planning Your Next Trip</a>
      </div>

      <p style="color: #64748b; font-size: 13px; text-align: center;">Or visit directly: <a href="${appUrl}" style="color: #14b8a6;">${appUrl}</a></p>
    ${COMMON_FOOTER}
  `;

  return {
    subject: "Welcome to TripBalancing - Email Verified!",
    html,
  };
}

// Travel Buddy Invitation Email
export function generateBuddyInviteEmail(data: {
  senderEmail: string;
  destination: string;
  accessType: "read" | "write";
  joinUrl: string;
}) {
  const accessLabel = data.accessType === "write" ? "Read-Write collaborator" : "Read-Only viewer";
  const safeDestination = data.destination || "an upcoming trip";
  const html = `
    ${COMMON_HEADER}
      <h2 style="color:#f8fafc;font-size:20px;font-weight:700;margin-top:0;">You're invited to a TripBalancing journey ✈️</h2>
      <p style="color:#cbd5e1;font-size:15px;line-height:1.6;"><strong>${data.senderEmail}</strong> invited you to join their trip to <strong>${safeDestination}</strong>.</p>
      <div class="card-box">
        <table class="data-table">
          <tr><td class="data-label">Destination</td><td class="data-value">${safeDestination}</td></tr>
          <tr><td class="data-label">Access</td><td class="data-value">${accessLabel}</td></tr>
        </table>
      </div>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;">Already registered? Sign in with this email address. New to TripBalancing? Create your account with this same email. Your pending invitation will then appear on your dashboard.</p>
      <div style="text-align:center;"><a href="${data.joinUrl}" class="btn-primary" target="_blank">Join Trip</a></div>
    ${COMMON_FOOTER}
  `;
  return { subject: `You're invited to ${safeDestination} on TripBalancing`, html };
}

// 2. Payment Success Email
export function generatePaymentSuccessEmail(data: {
  userName: string;
  planPurchased: string;
  amountPaid: number;
  razorpayPaymentId: string;
  purchaseDate: string;
}) {
  const name = data.userName || "Valued Customer";
  const planName = data.planPurchased === "lifetime" ? "Lifetime Access Pass" :
                   data.planPurchased === "yearly" ? "Annual Pro Explorer" : "Pay Per Trip Pass";
  const formattedAmount = `₹${data.amountPaid.toLocaleString()}`;

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(20, 184, 166, 0.15); border: 1px solid rgba(20, 184, 166, 0.3); color: #2dd4bf; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Payment Received
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Thank You for Your Upgrade, ${name}!</h2>
      <p style="color: #cbd5e1; font-size: 14px; text-align: center; line-height: 1.5;">Your payment has been successfully processed via Razorpay. Your premium plan features have been activated on your account.</p>

      <div class="card-box">
        <h3 style="color: #f8fafc; font-size: 15px; font-weight: 700; margin: 0 0 12px 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">Order Receipt</h3>
        <table class="data-table">
          <tr>
            <td class="data-label">Customer Name</td>
            <td class="data-value">${name}</td>
          </tr>
          <tr>
            <td class="data-label">Plan Purchased</td>
            <td class="data-value" style="color: #2dd4bf;">${planName}</td>
          </tr>
          <tr>
            <td class="data-label">Amount Paid</td>
            <td class="data-value" style="color: #4ade80;">${formattedAmount} INR</td>
          </tr>
          <tr>
            <td class="data-label">Razorpay Payment ID</td>
            <td class="data-value" style="font-family: monospace;">${data.razorpayPaymentId}</td>
          </tr>
          <tr>
            <td class="data-label">Purchase Date</td>
            <td class="data-value">${data.purchaseDate}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center;">
        <a href="https://tripbalancing.in" class="btn-primary" target="_blank">Access Pro Travel Hub</a>
      </div>
    ${COMMON_FOOTER}
  `;

  return {
    subject: `Payment Successful - Receipt for ${planName} (${data.razorpayPaymentId})`,
    html,
  };
}

// 3. Payment Failed Email
export function generatePaymentFailedEmail(data: {
  userName: string;
  attemptedPlan?: string;
  orderId?: string;
}) {
  const name = data.userName || "Traveler";
  const plan = data.attemptedPlan || "TripBalancing Upgrade";

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); color: #fb7185; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Payment Attempt Unsuccessful
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Payment Failed for ${plan}</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Hi ${name}, we noticed that your recent payment attempt for the <strong>${plan}</strong> could not be completed by your bank or payment gateway.</p>

      <div class="card-box" style="border-color: #f43f5e;">
        <h3 style="color: #fb7185; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">Common reasons for failure:</h3>
        <ul style="color: #94a3b8; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.7;">
          <li>Insufficient funds or daily card limits</li>
          <li>Temporary UPI / Banking gateway timeouts</li>
          <li>Incorrect OTP or 3D-Secure authentication</li>
        </ul>
        ${data.orderId ? `<p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0;">Order Reference: <code style="color: #94a3b8;">${data.orderId}</code></p>` : ""}
      </div>

      <p style="color: #cbd5e1; font-size: 14px;">No funds were charged. You can retry the transaction using a different UPI ID, Debit/Credit Card, or Netbanking option.</p>

      <div style="text-align: center;">
        <a href="https://tripbalancing.in" class="btn-primary" style="background-color: #f43f5e;" target="_blank">Retry Payment</a>
      </div>
    ${COMMON_FOOTER}
  `;

  return {
    subject: "Payment Unsuccessful - TripBalancing Upgrade",
    html,
  };
}

// 4. Refund Request Received Email
export function generateRefundRequestReceivedEmail(data: {
  userName: string;
  razorpayPaymentId: string;
  plan: string;
  requestDate: string;
}) {
  const name = data.userName || "Customer";

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); color: #fde047; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Refund Request Under Review
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0;">Refund Request Received</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Hi ${name}, we have logged your refund request. Our billing team will verify your transaction against our 7-day money-back guarantee policy.</p>

      <div class="card-box">
        <h3 style="color: #f8fafc; font-size: 14px; font-weight: 700; margin: 0 0 10px 0;">Request Details</h3>
        <table class="data-table">
          <tr>
            <td class="data-label">Payment ID</td>
            <td class="data-value" style="font-family: monospace;">${data.razorpayPaymentId}</td>
          </tr>
          <tr>
            <td class="data-label">Plan</td>
            <td class="data-value" style="text-transform: uppercase;">${data.plan}</td>
          </tr>
          <tr>
            <td class="data-label">Submitted On</td>
            <td class="data-value">${data.requestDate}</td>
          </tr>
          <tr>
            <td class="data-label">Status</td>
            <td class="data-value" style="color: #fde047;">Pending Eligibility Audit</td>
          </tr>
        </table>
      </div>

      <p style="color: #94a3b8; font-size: 13px;">Our policy covers requests submitted within 7 days of purchase provided AI trip generation services have not been fully consumed. Review usually takes 1-2 business days.</p>
    ${COMMON_FOOTER}
  `;

  return {
    subject: `Refund Request Received (${data.razorpayPaymentId})`,
    html,
  };
}

// 5. Refund Approved Email
export function generateRefundApprovedEmail(data: {
  userName: string;
  razorpayPaymentId: string;
  amountRefunded: number;
  approvedDate: string;
}) {
  const name = data.userName || "Customer";
  const formattedAmount = `₹${data.amountRefunded.toLocaleString()}`;

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); color: #4ade80; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Refund Approved
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Your Refund Has Been Approved</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Hi ${name}, your refund request for payment ID <strong>${data.razorpayPaymentId}</strong> has been approved by our finance team.</p>

      <div class="card-box" style="border-color: #22c55e;">
        <table class="data-table">
          <tr>
            <td class="data-label">Original Payment ID</td>
            <td class="data-value" style="font-family: monospace;">${data.razorpayPaymentId}</td>
          </tr>
          <tr>
            <td class="data-label">Approved Amount</td>
            <td class="data-value" style="color: #4ade80; font-size: 16px;">${formattedAmount} INR</td>
          </tr>
          <tr>
            <td class="data-label">Approval Date</td>
            <td class="data-value">${data.approvedDate}</td>
          </tr>
          <tr>
            <td class="data-label">Estimated Credit</td>
            <td class="data-value" style="color: #cbd5e1;">5-7 Business Days</td>
          </tr>
        </table>
      </div>

      <p style="color: #94a3b8; font-size: 13px;">The funds will be credited directly back to your original payment method (Bank/UPI/Card) via Razorpay refund processing.</p>
    ${COMMON_FOOTER}
  `;

  return {
    subject: `Refund Approved for ${formattedAmount} (${data.razorpayPaymentId})`,
    html,
  };
}

// 6. Refund Rejected Email
export function generateRefundRejectedEmail(data: {
  userName: string;
  razorpayPaymentId: string;
  reason?: string;
}) {
  const name = data.userName || "Customer";
  const reasonText = data.reason || "The request was submitted outside our 7-day money-back window or the active subscription credits were already utilized.";

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Refund Decision Update
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0;">Refund Request Status</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Hi ${name}, after reviewing your refund request for payment ID <strong>${data.razorpayPaymentId}</strong>, we are unable to process a refund at this time.</p>

      <div class="card-box">
        <h3 style="color: #f87171; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">Reason for Decision:</h3>
        <p style="color: #cbd5e1; font-size: 13px; margin: 0; line-height: 1.6;">${reasonText}</p>
      </div>

      <p style="color: #94a3b8; font-size: 13px;">If you feel this decision was made in error or if you have additional context regarding your trip planning experience, please reach out directly to our support desk.</p>

      <div style="text-align: center;">
        <a href="mailto:support@tripbalancing.in" class="btn-primary" style="background-color: #475569;" target="_blank">Contact Support Desk</a>
      </div>
    ${COMMON_FOOTER}
  `;

  return {
    subject: `Update regarding Refund Request (${data.razorpayPaymentId})`,
    html,
  };
}

// 7. Support Ticket Created Email
export function generateSupportTicketEmail(data: {
  userName: string;
  userEmail: string;
  ticketRef: string;
  subjectText: string;
  messageText: string;
}) {
  const name = data.userName || data.userEmail.split("@")[0] || "Traveler";

  const html = `
    ${COMMON_HEADER}
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: rgba(20, 184, 166, 0.15); border: 1px solid rgba(20, 184, 166, 0.3); color: #2dd4bf; font-weight: 800; font-size: 12px; padding: 6px 16px; border-radius: 20px; text-transform: uppercase;">
          Support Ticket Logged
        </span>
      </div>

      <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-top: 0;">We've Received Your Support Inquiry</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Hi ${name}, your support request has been logged with reference number <strong style="color: #2dd4bf;">${data.ticketRef}</strong>. Our dedicated support team will review your query and respond within 24 hours.</p>

      <div class="card-box">
        <h3 style="color: #f8fafc; font-size: 14px; font-weight: 700; margin: 0 0 10px 0;">Ticket Summary</h3>
        <table class="data-table">
          <tr>
            <td class="data-label">Ticket Reference</td>
            <td class="data-value" style="color: #2dd4bf; font-family: monospace;">${data.ticketRef}</td>
          </tr>
          <tr>
            <td class="data-label">Subject</td>
            <td class="data-value">${data.subjectText}</td>
          </tr>
          <tr>
            <td class="data-label">Submitted By</td>
            <td class="data-value">${data.userEmail}</td>
          </tr>
        </table>
        
        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #334155;">
          <div style="color: #94a3b8; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Your Message:</div>
          <div style="color: #cbd5e1; font-size: 13px; font-style: italic; background: #0b1329; padding: 10px; border-radius: 8px;">"${data.messageText}"</div>
        </div>
      </div>

      <p style="color: #94a3b8; font-size: 13px;">You can reply directly to this email to add further details to ticket ${data.ticketRef}.</p>
    ${COMMON_FOOTER}
  `;

  return {
    subject: `[${data.ticketRef}] Support Ticket Created: ${data.subjectText}`,
    html,
  };
}
