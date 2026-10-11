import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata() {
  const t = await getTranslations("Register");
  return { title: t("title") };
}

export default async function RegistroPage() {
  const t = await getTranslations("Register");

  return (
    <main className="flex flex-1 flex-col">
      <Section className="flex flex-1 items-center">
        <Container className="max-w-md">
          <span className="font-heading text-sm font-semibold uppercase tracking-widest text-brand-blue">
            {t("eyebrow")}
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-2 text-foreground/60">{t("subtitle")}</p>

          <RegisterForm />
        </Container>
      </Section>
    </main>
  );
}
