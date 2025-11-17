import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to the page first
    await page.goto('https://example.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Page loaded:', await page.url());

    // Extract the title
    const headingText = await page.evaluate(() => {
        const heading = document.querySelector('title');
        return heading ? heading.textContent : 'Element not found';
    });
    console.log(`Extracted Heading: ${headingText}`);

    // Extract all paragraph texts
    const paragraphTexts = await page.evaluate(() => {
        const paragraphs = Array.from(document.querySelectorAll('p'));
        return paragraphs.map(p => p.textContent || '');
    });
    console.log('Extracted Paragraphs:');
    paragraphTexts.forEach((text, i) => console.log(`${i + 1}: ${text}`));

    // Keep browser open for some time so you can inspect
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    console.log('Browser will remain open for 60 seconds...');
    await sleep(60000); // 10000 = 1 secondS

    await browser.close();
})();
