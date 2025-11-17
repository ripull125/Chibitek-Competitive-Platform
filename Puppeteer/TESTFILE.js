import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://example.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Page loaded:', await page.url());

    console.log('Browser will remain open for 60 seconds...');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    await sleep(5000); // 1000 = 1 second

    await browser.close();
})();
