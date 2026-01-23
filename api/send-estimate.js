const nodemailer = require('nodemailer');

// Email transporter using environment variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

module.exports = async (req, res) => {
    // CORS headers - restrict to trusted origins
    const allowedOrigins = [
        'https://surprisegranite.com',
        'https://www.surprisegranite.com',
        'https://surprise-granite-site.netlify.app',
        'http://localhost:3333',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
            pricePremium,
            sections,
            date
        } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%); color: #fff; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 5px 0 0; opacity: 0.8; }
        .logo { color: #f9cb00; }
        .content { padding: 30px; background: #f8f9fa; }
        .section { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
        .section h2 { margin: 0 0 15px; font-size: 16px; color: #888; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .line-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .line-item:last-child { border-bottom: none; }
        .line-item .label { color: #666; }
        .line-item .value { font-weight: bold; color: #1a1a2e; }
        .price-tier { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .price-tier.popular { background: #fffbeb; border: 2px solid #f9cb00; }
        .tier-name { font-weight: bold; }
        .tier-desc { font-size: 12px; color: #888; }
        .tier-price { font-size: 18px; font-weight: bold; color: #f9cb00; }
        .cta { text-align: center; padding: 20px; }
        .cta-btn { display: inline-block; background: #f9cb00; color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
        .disclaimer { font-size: 11px; color: #999; font-style: italic; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Your Countertop Estimate</h1>
        <p><span class="logo">Surprise Granite</span> Marble & Quartz</p>
    </div>
    <div class="content">
        <div class="section">
            <h2>Summary</h2>
            <div class="line-item">
                <span class="label">Countertop Area</span>
                <span class="value">${counterSqft}</span>
            </div>
            ${splashSqft && splashSqft !== '0 sqft' ? `
            <div class="line-item">
                <span class="label">Backsplash Area</span>
                <span class="value">${splashSqft}</span>
            </div>
            ` : ''}
            <div class="line-item">
                <span class="label">Total with 10% Waste</span>
                <span class="value">${totalSqft}</span>
            </div>
            <div class="line-item">
                <span class="label">Edge Profile</span>
                <span class="value">${edgeProfile}</span>
            </div>
            <div class="line-item">
                <span class="label">Edge Length</span>
                <span class="value">${edgeLF}</span>
            </div>
        </div>

        <div class="section">
            <h2>Estimated Price Range</h2>
            <div class="price-tier">
                <div>
                    <div class="tier-name">Budget-Friendly</div>
                    <div class="tier-desc">Basic granite & quartz</div>
                </div>
                <div class="tier-price">${priceBudget}</div>
            </div>
            <div class="price-tier popular">
                <div>
                    <div class="tier-name">Popular Choice</div>
                    <div class="tier-desc">Mid-range selections</div>
                </div>
                <div class="tier-price">${pricePopular}</div>
            </div>
            <div class="price-tier">
                <div>
                    <div class="tier-name">Premium</div>
                    <div class="tier-desc">High-end & exotic</div>
                </div>
                <div class="tier-price">${pricePremium}</div>
            </div>
            <p class="disclaimer">* This is an estimate only. Final pricing depends on material selection, edge profile, cutouts, and layout complexity.</p>
        </div>

        <div class="cta">
            <p>Ready for an exact quote? Schedule a free in-home estimate!</p>
            <a href="https://surprisegranite.com/get-a-free-estimate/" class="cta-btn">Schedule Free Estimate</a>
        </div>
    </div>
    <div class="footer">
        <p>Surprise Granite Marble & Quartz<br>
        Greater Phoenix, AZ | (602) 833-3189<br>
        <a href="https://surprisegranite.com">surprisegranite.com</a></p>
    </div>
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

        res.status(200).json({ success: true, message: 'Estimate sent successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
};
