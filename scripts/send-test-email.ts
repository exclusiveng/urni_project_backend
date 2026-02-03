import dotenv from 'dotenv';
dotenv.config();

import { mailService } from '../src/services/mail.service';

async function main() {
  try {
    await mailService.sendTemplate(process.env.CEO_EMAIL || 'test@example.com', 'Test Email', 'notification', {
      title: 'Test email from URNI',
      body: 'If you received this, SMTP is configured correctly.',
      cta_text: 'Open App',
      cta_url: process.env.FRONTEND_URL || '#',
      preheader: 'Test email from URNI',
    });
    console.log('Test email sent (or queued) successfully');
  } catch (err: any) {
    console.error('Email send failed:', err);
    process.exit(1);
  }
}

main();
