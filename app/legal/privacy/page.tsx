import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { getOperator } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";
import { LastUpdated, legalLang } from "../updated";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getServerDictionary();
  return { title: dict.legal.privacy, alternates: { canonical: "/legal/privacy" } };
}

export default async function PrivacyPage() {
  const { locale } = await getServerDictionary();
  const lang = legalLang(locale);
  const op = getOperator();
  const domain = new URL(SITE_URL).host;
  const mail = <a href={`mailto:${op.email}`}>{op.email}</a>;

  if (lang === "de") {
    return (
      <>
        <h1>Datenschutzerklärung</h1>
        <p>
          Diese Erklärung beschreibt, welche Personendaten bei der Nutzung von {domain}{" "}
          („Prompt Battle“) bearbeitet werden. Sie richtet sich nach dem
          Schweizer Datenschutzgesetz (DSG) und, soweit anwendbar, der
          EU-Datenschutz-Grundverordnung (DSGVO). Wir erheben so wenig Daten wie möglich:
          keine Werbung, kein Tracking, keine Analyse-Cookies.
        </p>

        <h2>1. Verantwortliche Stelle</h2>
        <p>
          {op.name}, {op.address}, {mail}
        </p>

        <h2>2. Welche Daten wir bearbeiten</h2>
        <h3>Besuch der Website</h3>
        <p>
          Beim Aufruf der Website verarbeitet unser Hosting-Anbieter technisch notwendige
          Daten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser-Typ), um die Website
          auszuliefern und vor Missbrauch zu schützen. Diese Logdaten werden nur kurz
          gespeichert.
        </p>
        <h3>Konten von Veranstaltenden</h3>
        <p>
          Wer Turniere erstellt, braucht ein Konto. Wir speichern die E-Mail-Adresse und
          – bei Anmeldung mit Google oder GitHub – den Namen und das Profilbild, die
          der jeweilige Anbieter übermittelt. Zweck: Bereitstellung des Kontos
          (Vertragserfüllung, Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <h3>Turniere und Spielende</h3>
        <p>
          Wir speichern die Inhalte eines Turniers: Turniername, Aufgaben, hochgeladene
          Referenzbilder, die von Spielenden gewählten Spielnamen, ihre Prompts, die
          generierten Bilder und Videos sowie Abstimmungen. Spielende brauchen kein Konto
          und geben keine E-Mail-Adresse an; sie werden über eine zufällige Kennung im
          lokalen Speicher ihres Browsers wiedererkannt. Bitte keine Personendaten in
          Spielnamen oder Prompts eingeben.
        </p>
        <h3>KI-Generierung</h3>
        <p>
          Um Bilder und Videos zu erzeugen, werden die Prompts an den für das Turnier
          gewählten KI-Anbieter übermittelt: Google (Gemini, Veo), OpenAI oder Replicate. Verwenden
          Veranstaltende eigene API-Keys, gilt zusätzlich deren eigener Vertrag mit dem
          Anbieter. Solche Keys speichern wir verschlüsselt (AES-256) und nur für das
          jeweilige Turnier.
        </p>
        <h3>Zahlungen</h3>
        <p>
          Premium-Upgrades werden über Stripe abgewickelt. Wir erhalten nur den
          Zahlungsstatus, den Betrag und die bei Stripe angegebene E-Mail-Adresse –
          niemals vollständige Karten- oder Kontodaten.
        </p>
        <h3>E-Mails</h3>
        <p>
          Login-Links und Bestätigungen versenden wir über unseren
          Authentifizierungsdienst. Newsletter versenden wir nicht.
        </p>

        <h2>3. Cookies und lokaler Speicher</h2>
        <p>Wir verwenden ausschliesslich technisch notwendige Speicher:</p>
        <ul>
          <li>Sitzungs-Cookies für angemeldete Veranstaltende,</li>
          <li>ein Cookie für die gewählte Sprache („pb_locale“, 1 Jahr),</li>
          <li>
            lokaler Browser-Speicher für die Spielenden-Kennung und die Ton-Einstellung
            der Bühnenansicht.
          </li>
        </ul>

        <h2>4. Auftragsbearbeiter und Übermittlung ins Ausland</h2>
        <ul>
          <li>Vercel Inc., USA – Hosting</li>
          <li>Supabase Inc., USA – Datenbank, Anmeldung, Dateispeicher</li>
          <li>Stripe Payments Europe Ltd., Irland – Zahlungen</li>
          <li>Google LLC, OpenAI, Replicate Inc., USA – KI-Generierung</li>
          <li>Google bzw. GitHub – nur bei Anmeldung mit deren Konto</li>
        </ul>
        <p>
          Einige dieser Anbieter bearbeiten Daten in den USA. Die Übermittlung stützt sich,
          soweit vorhanden, auf das Swiss-U.S. bzw. EU-U.S. Data Privacy Framework und
          im Übrigen auf Standardvertragsklauseln.
        </p>

        <h2>5. Aufbewahrung</h2>
        <p>
          Turnierdaten inklusive generierter Medien bleiben gespeichert, bis die
          Veranstaltenden das Turnier oder ihr Konto löschen. Zahlungsbelege bewahren wir
          gemäss den gesetzlichen Buchführungspflichten auf (in der Schweiz 10 Jahre).
        </p>

        <h2>6. Deine Rechte</h2>
        <p>
          Du kannst Auskunft, Berichtigung, Löschung, Einschränkung und Herausgabe deiner
          Daten verlangen sowie der Bearbeitung widersprechen. Schreib uns dazu an {mail}.
          Als Spielende:r gib bitte den Turniercode und deinen Spielnamen an. Du kannst
          dich zudem beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten
          (EDÖB) oder einer EU-Aufsichtsbehörde beschweren.
        </p>

        <h2>7. Änderungen</h2>
        <p>
          Wir passen diese Erklärung an, wenn sich der Dienst ändert. Es gilt die jeweils
          hier veröffentlichte Fassung.
        </p>
        <LastUpdated lang="de" />
      </>
    );
  }

  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        This policy explains which personal data is processed when you use {domain}{" "}
        (“Prompt Battle”). It follows the Swiss Federal Act on Data Protection (FADP)
        and, where applicable, the EU General Data Protection Regulation (GDPR). We
        collect as little as possible: no ads, no tracking, no analytics cookies.
      </p>

      <h2>1. Controller</h2>
      <p>
        {op.name}, {op.address}, {mail}
      </p>

      <h2>2. Data we process</h2>
      <h3>Visiting the website</h3>
      <p>
        When you open the website, our hosting provider processes technically necessary
        data (IP address, time, requested page, browser type) to deliver the site and
        protect it against abuse. These logs are kept only briefly.
      </p>
      <h3>Host accounts</h3>
      <p>
        Creating tournaments requires an account. We store your email address and – if
        you sign in with Google or GitHub – the name and profile picture that provider
        shares. Purpose: providing your account (performance of contract, Art. 6(1)(b)
        GDPR).
      </p>
      <h3>Tournaments and players</h3>
      <p>
        We store a tournament’s content: its name, tasks, uploaded reference images, the
        nicknames players choose, their prompts, the generated images and videos, and
        votes. Players need no account and provide no email address; they are recognised
        by a random ID kept in their browser’s local storage. Please do not put personal
        information in nicknames or prompts.
      </p>
      <h3>AI generation</h3>
      <p>
        To create images and videos, prompts are sent to the AI provider selected for the
        tournament: Google (Gemini, Veo), OpenAI or Replicate. When hosts use their own
        API keys, their own agreement with that provider applies as well. We store such
        keys encrypted (AES-256) and only for the tournament they belong to.
      </p>
      <h3>Payments</h3>
      <p>
        Premium upgrades are processed by Stripe. We only receive the payment status, the
        amount and the email address given to Stripe – never full card or bank details.
      </p>
      <h3>Emails</h3>
      <p>
        Login links and confirmations are sent through our authentication service. We do
        not send newsletters.
      </p>

      <h2>3. Cookies and local storage</h2>
      <p>We only use strictly necessary storage:</p>
      <ul>
        <li>session cookies for signed-in hosts,</li>
        <li>a cookie for your chosen language (“pb_locale”, 1 year),</li>
        <li>local browser storage for the player ID and the stage view’s sound setting.</li>
      </ul>

      <h2>4. Processors and international transfers</h2>
      <ul>
        <li>Vercel Inc., USA – hosting</li>
        <li>Supabase Inc., USA – database, sign-in, file storage</li>
        <li>Stripe Payments Europe Ltd., Ireland – payments</li>
        <li>Google LLC, OpenAI, Replicate Inc., USA – AI generation</li>
        <li>Google or GitHub – only if you sign in with their account</li>
      </ul>
      <p>
        Some of these providers process data in the USA. Transfers rely on the Swiss-U.S.
        or EU-U.S. Data Privacy Framework where available, and on standard contractual
        clauses otherwise.
      </p>

      <h2>5. Retention</h2>
      <p>
        Tournament data, including generated media, is kept until the host deletes the
        tournament or their account. Payment records are kept as required by statutory
        bookkeeping rules (10 years in Switzerland).
      </p>

      <h2>6. Your rights</h2>
      <p>
        You may request access to, correction, deletion, restriction and a copy of your
        data, and object to its processing. Contact us at {mail}; as a player, please
        include the tournament code and your nickname. You may also lodge a complaint
        with the Swiss Federal Data Protection and Information Commissioner (FDPIC) or an
        EU supervisory authority.
      </p>

      <h2>7. Changes</h2>
      <p>
        We update this policy when the service changes. The version published here
        applies.
      </p>
      <LastUpdated lang="en" />
    </>
  );
}
