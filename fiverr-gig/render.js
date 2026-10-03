const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 769 } });
  await page.goto('file://' + path.join(__dirname, 'gig-image.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] || path.join(__dirname, 'base44-security-gig.png') });
  await browser.close();
})();
