const express = require('express');
const cron = require('node-cron');
const path = require('path');
const { scrapeLinkedIn } = require('./scrape');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files (dashboard)
app.use(express.static(path.join(__dirname)));

// Health check - moved to /api/status so index.html is served at /
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', service: 'LinkedIn Scraper', lastRun: global.lastRun || 'never' });
});

// Manual trigger endpoint
app.post('/scrape', async (req, res) => {
    try {
        console.log('🚀 Manual scrape triggered');
        const result = await scrapeLinkedIn();
        global.lastRun = new Date().toISOString();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('❌ Scrape error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Schedule scraping every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Scheduled scrape started');
    try {
        await scrapeLinkedIn();
        global.lastRun = new Date().toISOString();
        console.log('✅ Scheduled scrape completed');
    } catch (error) {
        console.error('❌ Scheduled scrape failed:', error);
    }
});

app.listen(PORT, () => {
    console.log(`🔥 Scraper service running on port ${PORT}`);
    console.log('📅 Cron scheduled: every 6 hours');
});
