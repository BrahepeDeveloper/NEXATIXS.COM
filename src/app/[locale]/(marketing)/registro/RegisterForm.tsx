"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hardNavigateTo } from "@/lib/auth/resolve-home";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Step = "form" | "code";

export function RegisterForm() {
  const t = useTranslations("Register");
  const locale = useLocale();

  const [step, setStep] = useState<Step>("form");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, contactName, email }),
    });
    const result = (await response.json()) as { ok: boolean; error?: string };

    setSubmitting(false);

    if (!result.ok) {
      setError(
        result.error === "rate_limited"
          ? t("rateLimited")
          : result.error === "registration_failed"
            ? t("registrationFailed")
            : t("genericError"),
      );
      return;
    }

    setStep("code");
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const result = (await response.json()) as { ok: boolean; error?: string; destination?: string };

    if (!result.ok || !result.destination) {
      setSubmitting(false);
      setError(result.error === "invalid_code" ? t("invalidCode") : t("genericError"));
      return;
    }

    setSubmitting(false);
    hardNavigateTo(locale, result.destination);
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="mt-8 space-y-5">
        <p className="text-sm text-foreground/60">{t("codeSentTo", { email })}</p>
        <Field label={t("code")} htmlFor="otp-code">
          <Input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={submitting || code.length !== 6}>
          {submitting ? t("submitting") : t("verifyCode")}
        </Button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleRegister} className="mt-8 space-y-5">
        <Field label={t("companyName")} htmlFor="companyName">
          <Input
            id="companyName"
            required
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </Field>
        <Field label={t("contactName")} htmlFor="contactName">
          <Input
            id="contactName"
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </Field>
        <Field label={t("email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-foreground/60">
        {t("haveAccount")}{" "}
        <Link href="/iniciar-sesion" className="font-medium text-brand-blue hover:underline">
          {t("login")}
        </Link>
      </p>
    </>
  );
}
