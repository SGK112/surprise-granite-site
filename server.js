const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Send estimate endpoint
app.post('/api/send-estimate', async (req, res) => {
    try {
        const {
            email,
            counterSqft,
            splashSqft,
            totalSqft,
            edgeProfile,
            edgeLF,
            priceBudget,
            pricePopular,
            pricePremium
        } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Your Countertop Estimate</h1>
                            <p style="color: #f9cb00; margin: 10px 0 0; font-size: 18px; font-weight: bold;">Surprise Granite</p>
                            <p style="color: #cccccc; margin: 5px 0 0; font-size: 14px;">Marble & Quartz</p>
                        </td>
                    </tr>

                    <!-- Summary Section -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 30px 40px;">
                            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 20px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Project Summary</h2>

                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Countertop Area</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${counterSqft}</strong>
                                    </td>
                                </tr>
                                ${splashSqft && splashSqft !== '0 sqft' && splashSqft !== '0.00 sqft' ? `
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Backsplash Area</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${splashSqft}</strong>
                                    </td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Total with 10% Waste</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${totalSqft}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                                        <span style="color: #666666; font-size: 15px;">Edge Profile</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #eeeeee; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${edgeProfile}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <span style="color: #666666; font-size: 15px;">Edge Length</span>
                                    </td>
                                    <td style="padding: 12px 0; text-align: right;">
                                        <strong style="color: #1a1a2e; font-size: 15px;">${edgeLF}</strong>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Price Section -->
                    <tr>
                        <td style="background-color: #f9f9f9; padding: 30px 40px;">
                            <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 20px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">Estimated Price Range</h2>

                            <!-- Budget Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 12px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Budget-Friendly</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">Basic granite & quartz</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: bold;">${priceBudget}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Popular Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 2px solid #f9cb00; border-radius: 8px; margin-bottom: 12px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Popular Choice ★</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">Mid-range selections</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #c9a000; font-size: 22px; font-weight: bold;">${pricePopular}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Premium Tier -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 16px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: bold;">Premium</p>
                                        <p style="margin: 4px 0 0; color: #888888; font-size: 13px;">High-end & exotic</p>
                                    </td>
                                    <td style="padding: 16px 20px; text-align: right;">
                                        <p style="margin: 0; color: #1a1a2e; font-size: 20px; font-weight: bold;">${pricePremium}</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0; color: #888888; font-size: 12px; font-style: italic;">* This is an estimate only. Final pricing depends on material selection, edge profile, cutouts, and layout complexity.</p>
                        </td>
                    </tr>

                    <!-- CTA Section -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <p style="color: #ffffff; font-size: 18px; margin: 0 0 20px;">Ready for an exact quote?</p>
                            <a href="https://surprisegranite.com/get-a-free-estimate/" style="display: inline-block; background-color: #f9cb00; color: #1a1a2e; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Schedule Free Estimate</a>
                            <p style="color: #cccccc; font-size: 14px; margin: 20px 0 0;">Or call us: <a href="tel:+16028333189" style="color: #f9cb00; text-decoration: none; font-weight: bold;">(602) 833-3189</a></p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f4f4f4; padding: 20px 40px; text-align: center;">
                            <p style="color: #888888; font-size: 13px; margin: 0;">Surprise Granite Marble & Quartz</p>
                            <p style="color: #888888; font-size: 13px; margin: 5px 0;">Greater Phoenix, AZ | We Come to You!</p>
                            <p style="color: #888888; font-size: 12px; margin: 10px 0 0;"><a href="https://surprisegranite.com" style="color: #1a1a2e;">surprisegranite.com</a></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        // Send to customer
        await transporter.sendMail({
            from: `"Surprise Granite" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your Countertop Estimate - Surprise Granite',
            html: emailHtml
        });

        // Send copy to business
        await transporter.sendMail({
            from: `"Website Estimate" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `New Estimate Request from ${email}`,
            html: `
                <h2>New Estimate Generated</h2>
                <p><strong>Customer Email:</strong> ${email}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                <hr>
                <p><strong>Countertop:</strong> ${counterSqft}</p>
                <p><strong>Backsplash:</strong> ${splashSqft || 'None'}</p>
                <p><strong>Total (with waste):</strong> ${totalSqft}</p>
                <p><strong>Edge:</strong> ${edgeProfile} - ${edgeLF}</p>
                <hr>
                <p><strong>Budget Range:</strong> ${priceBudget}</p>
                <p><strong>Popular Range:</strong> ${pricePopular}</p>
                <p><strong>Premium Range:</strong> ${pricePremium}</p>
            `
        });

        res.json({ success: true, message: 'Estimate sent successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
