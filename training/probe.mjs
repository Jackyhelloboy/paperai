export default async function run(page, ui) {
  return await page.evaluate(async () => {
    const html = await (await fetch('/frontend/index.html')).text();
    const m = /<script>([\s\S]*?)<\/script>/.exec(html);
    const expected = m ? m[1] : null;
    const actual = [...document.scripts].map(s => s.textContent || '').sort((a, b) => b.length - a.length)[0];
    if (!expected || !actual) return { missing: true, expected: !!expected, actual: !!actual };
    let i = 0;
    while (i < Math.min(expected.length, actual.length) && expected[i] === actual[i]) i++;
    return {
      expectedLen: expected.length,
      actualLen: actual.length,
      diffAt: i,
      expectedSlice: expected.slice(Math.max(0, i - 60), i + 60),
      actualSlice: actual.slice(Math.max(0, i - 60), i + 60)
    };
  });
}
