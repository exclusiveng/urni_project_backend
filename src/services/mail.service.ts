import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";

type Provider = "smtp" | "sendgrid" | "console";

interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export class MailService {
  private provider: Provider;
  private transporter: nodemailer.Transporter | null = null;
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private mailingEnabled: boolean = true;

  constructor() {
    this.provider = (process.env.MAIL_PROVIDER as Provider) || "console";

    // Global switch: set MAILING_ENABLED=0 to disable sending emails (useful on hosting without SMTP)
    this.mailingEnabled = (process.env.MAILING_ENABLED ?? "1") === "1";

    // Register partials/helpers regardless of provider so templates compile in dev
    this.registerPartials();
    this.registerHelpers();

    if (this.provider === "sendgrid") {
      const key = process.env.SENDGRID_API_KEY;
      if (!key) throw new Error("SENDGRID_API_KEY is required for sendgrid provider");
      sgMail.setApiKey(key);
    }

    if (this.provider === "smtp") {
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpSecure = (process.env.SMTP_SECURE || "false") === "true";

      if (!smtpUser || !smtpPass) throw new Error("SMTP_USER and SMTP_PASS are required for smtp provider");

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        pool: true,
      });
    }
  }

  private registerHelpers() {
    Handlebars.registerHelper("formatDate", (date: any) => {
      if (!date) return "";
      const d = new Date(date);
      return d.toLocaleString();
    });

    Handlebars.registerHelper("asset", (key: string) => {
      if (key === "logo") return process.env.MAIL_BRAND_LOGO_URL || "";
      return "";
    });
  }

  private registerPartials() {
    try {
      const partialsDir = path.join(process.cwd(), "src", "templates", "emails", "partials");
      if (!fs.existsSync(partialsDir)) return;
      const files = fs.readdirSync(partialsDir);
      for (const f of files) {
        if (!f.endsWith(".hbs")) continue;
        const name = path.basename(f, ".hbs");
        const content = fs.readFileSync(path.join(partialsDir, f), "utf8");
        Handlebars.registerPartial(name, content);
      }
    } catch (err) {
      console.warn("Failed to register email partials", err);
    }
  }

  private loadTemplate(name: string) {
    if (this.templates.has(name)) return this.templates.get(name)!;

    const filePath = path.join(process.cwd(), "src", "templates", "emails", `${name}.hbs`);
    if (!fs.existsSync(filePath)) throw new Error(`Template not found: ${name}`);

    const content = fs.readFileSync(filePath, "utf8");
    const compiled = Handlebars.compile(content);
    this.templates.set(name, compiled);
    return compiled;
  }

  async sendMail(opts: MailOptions) {
    const from = opts.from || process.env.MAIL_FROM || `no-reply@${process.env.MAIL_FROM_DOMAIN || "example.com"}`;

    if (!this.mailingEnabled) {
      console.info("[MailService] Mailing disabled by MAILING_ENABLED=0 - skipping send", { to: opts.to, subject: opts.subject });
      return;
    }

    if (this.provider === "console") {
      console.info("[MailService] Sending mail (console provider)", { to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
      return;
    }

    if (this.provider === "sendgrid") {
      await sgMail.send({
        to: opts.to,
        from,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      } as any);
      return;
    }

    if (this.provider === "smtp") {
      if (!this.transporter) throw new Error("SMTP transporter not initialized");

      await this.transporter.sendMail({
        to: opts.to,
        from,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return;
    }

    throw new Error("Mail provider not supported");
  }

  async sendTemplate(to: string, subject: string, templateName: string, context: any = {}) {
    if (!this.mailingEnabled) {
      console.info("[MailService] Mailing disabled by MAILING_ENABLED=0 - skipping sendTemplate", { to, subject, templateName });
      return;
    }

    const tpl = this.loadTemplate(templateName);

    const merged = {
      subject,
      preheader: context.preheader || (context.body ? (context.body.replace(/(<([^>]+)>|\n)/g, " ") || "") : ""),
      brandName: process.env.MAIL_BRAND_NAME || "URNI",
      brandUrl: process.env.MAIL_BRAND_URL || "example.com",
      logoUrl: process.env.MAIL_BRAND_LOGO_URL || "",
      unsubscribe_url: process.env.MAIL_UNSUBSCRIBE_URL || "",
      unsubscribe_message: context.unsubscribe_message || `To manage your email preferences, visit your account settings or <a href=\"${process.env.MAIL_UNSUBSCRIBE_URL || "#"}\">unsubscribe</a>.`,
      year: context.year || new Date().getFullYear(),
      ...context,
    };

    const html = tpl(merged);
    const text = this.stripHtml(html);

    return this.sendMail({ to, subject, html, text });
  }

  private stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, "");
  }
}

// Export a singleton
export const mailService = new MailService();
