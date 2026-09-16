import fs from 'fs';

const findings = JSON.parse(fs.readFileSync('/tmp/all_findings.json', 'utf8'));

export default async function (page) {
  const frame = page.frameLocator('iframe').first();
  for (let i = 0; i < findings.length; i++) {
    const boxes = await page.getByRole('textbox', { name: 'Describe the bug you found...' }).all();
    const box = boxes[boxes.length - 1];
    await box.fill(findings[i]);
    if (i < findings.length - 1) {
      await page.getByRole('button', { name: '+ Add Finding' }).click();
    }
  }
  return { filled: findings.length };
}
