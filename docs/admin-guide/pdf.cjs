const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/guide.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: '' + __dirname + '/../../public/admin/guide.pdf', format: 'A4', printBackground: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center">83Products 管理画面の使い方 ・ <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' } });
  await b.close();
})();
