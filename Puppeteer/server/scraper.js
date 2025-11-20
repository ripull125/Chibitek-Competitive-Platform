import puppeteer from 'puppeteer';

export async function Scraping() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // change page name to scrape different data
    await page.goto('https://books.toscrape.com/', {
        waitUntil: 'networkidle2', timeout: 60000 // 1000 = 1 second
    });

    // use html tags of what type of data you want to scrape
    const headingText = await page.evaluate(() => {
        const heading = document.querySelector('title');
        return heading ? heading.textContent : 'Element not found';
    });

    const paragraphTexts = await page.evaluate(() => {
        const paragraphs = Array.from(document.querySelectorAll('p'));
        return paragraphs.map(p => p.textContent || '');
    });

    await browser.close();

    // return the data sraped, later add to a json file 
    return { heading: headingText, paragraphs: paragraphTexts };
}
