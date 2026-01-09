import puppeteer from 'puppeteer';

export async function Scraping() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // change page name to scrape different data
    await page.goto('https://books.toscrape.com/');

    // use html tags of what type of data you want to scrape
    const headingText = await page.evaluate(() => {
        const heading = document.querySelector('title');
        return heading ? heading.textContent : 'Element not found';
    })
    const paragraphTexts = await page.evaluate(() => {
        const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const paragraphs = Array.from(document.querySelectorAll('p')).filter((p) => {
            const classes = p.className || '';
            return !classes.includes('price_color') && !classes.includes('instock');
        });
        return paragraphs
            .map((p) => cleanText(p.textContent))
            .filter(Boolean);
    });

    const books = await page.evaluate(() => {
        const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();

        return Array.from(document.querySelectorAll('.product_pod')).map((card) => {
            const titleElement = card.querySelector('h3 a');
            const title = titleElement?.getAttribute('title') || cleanText(titleElement?.textContent);
            const price = cleanText(card.querySelector('.price_color')?.textContent);
            const availability = cleanText(card.querySelector('.instock.availability')?.textContent);

            return {
                title: title || 'Unknown title',
                price,
                availability,
            };
        });
    });

    const currentUrl = await page.url();

    await browser.close();

    return {
        heading: headingText,
        paragraphs: paragraphTexts,
        url: currentUrl,
        platform_post_id: currentUrl,
        books
    }
}