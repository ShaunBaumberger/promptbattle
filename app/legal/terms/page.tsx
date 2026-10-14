import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { getOperator } from "@/lib/legal";
import { donateProviderName } from "@/lib/donate";
import { FREE_GAMES_PER_WINDOW, limitsFor } from "@/lib/tiers";
import { REPO_URL, SITE_URL } from "@/lib/site";
import { LastUpdated, legalLang } from "../updated";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getServerDictionary();
  return { title: dict.legal.terms, alternates: { canonical: "/legal/terms" } };
}

export default async function TermsPage() {
  const { locale } = await getServerDictionary();
  const lang = legalLang(locale);
  const op = getOperator();
  const domain = new URL(SITE_URL).host;
  const mail = <a href={`mailto:${op.email}`}>{op.email}</a>;
  const donateProvider = donateProviderName();
  const freePlayers = limitsFor("free").maxPlayers;
  const ownKeyPlayers = limitsFor("premium").maxPlayers;

  if (lang === "de") {
    return (
      <>
        <h1>Allgemeine Geschäftsbedingungen</h1>

        <h2>1. Geltungsbereich</h2>
        <p>
          Diese Bedingungen gelten für die Nutzung von {domain} („Prompt Battle“, „der
          Dienst“), betrieben von {op.name}, {op.address}.
        </p>

        <h2>2. Der Dienst</h2>
        <p>
          Prompt Battle ist ein Live-Spiel: Veranstaltende erstellen Turniere,
          Spielende treten per Code auf dem Smartphone bei und erzeugen mit KI Bilder oder
          Videos, die auf einer Bühnenansicht gezeigt und bewertet werden.
        </p>

        <h2>3. Konten</h2>
        <p>
          Veranstaltende brauchen ein Konto und müssen volljährig sein oder mit
          Zustimmung einer erziehungsberechtigten Person handeln. Halte deine Zugangsdaten
          geheim. Spielende brauchen kein Konto.
        </p>

        <h2>4. Nutzung und Kosten</h2>
        <p>Der Dienst ist kostenlos. Es gibt keine kostenpflichtigen Pläne.</p>
        <ul>
          <li>
            <strong>Free:</strong> bis {freePlayers} Spielende, Bild- und Textaufgaben,
            Standard-Bildmodell, {FREE_GAMES_PER_WINDOW} Turnierstarts pro 30 Tage. Die
            KI-Kosten trägt der Betreiber innerhalb eines Gesamtbudgets; ist es
            ausgeschöpft, können neue Gratis-Turniere bis zum nächsten Zeitraum nicht
            gestartet werden. Laufende Turniere sind davon nicht betroffen. Die Limits des
            Gratis-Plans können wir anpassen.
          </li>
          <li>
            <strong>Eigene API-Keys:</strong> kostenlos. Schaltet bis {ownKeyPlayers}{" "}
            Spielende, Videoaufgaben und die Modellauswahl frei. Du bezahlst die
            Generierung direkt beim jeweiligen KI-Anbieter und bist für die Einhaltung von
            dessen Bedingungen verantwortlich. Für Kosten auf deinem Anbieter-Konto haften
            wir nicht.
          </li>
          {donateProvider && (
            <li>
              <strong>Spenden:</strong> Du kannst Prompt Battle freiwillig mit einer Spende
              unterstützen. Spenden begründen keinen Anspruch auf Leistungen oder Funktionen
              und werden über {donateProvider} abgewickelt. Eine irrtümliche Spende
              erstatten wir auf Anfrage an {mail} innerhalb von 14 Tagen.
            </li>
          )}
        </ul>

        <h2>5. Zulässige Nutzung</h2>
        <p>
          Untersagt sind rechtswidrige, verletzende, diskriminierende, gewaltverherrlichende
          oder sexuelle Inhalte, Inhalte, die Rechte Dritter verletzen, sowie Verstösse
          gegen die Nutzungsrichtlinien der KI-Anbieter. Veranstaltende sind für ihr Event,
          ihre Aufgaben und hochgeladenen Bilder (für die sie die Rechte haben müssen)
          verantwortlich. Bei Verstössen können wir Inhalte löschen und Konten sperren.
        </p>

        <h2>6. Inhalte und KI-Ergebnisse</h2>
        <p>
          Deine Rechte an hochgeladenen Inhalten bleiben bei dir. Du erlaubst uns, sie zu
          speichern, zu verarbeiten und anzuzeigen, soweit dies für den Dienst nötig ist.
          KI-generierte Inhalte können unerwartet oder fehlerhaft sein; für ihre Qualität
          und Verfügbarkeit übernehmen wir keine Gewähr.
        </p>

        <h2>7. Verfügbarkeit</h2>
        <p>
          Wir bemühen uns um einen zuverlässigen Betrieb, garantieren aber keine
          unterbrechungsfreie Verfügbarkeit. Wir empfehlen vor wichtigen Events einen
          Probelauf im Test-Modus.
        </p>

        <h2>8. Haftung</h2>
        <p>
          Soweit gesetzlich zulässig, ist unsere Haftung für leichte Fahrlässigkeit
          ausgeschlossen. Die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt
          unberührt.
        </p>

        <h2>9. Open Source</h2>
        <p>
          Der Quellcode ist unter der AGPL-3.0 auf <a href={REPO_URL}>GitHub</a>{" "}
          verfügbar. Diese Bedingungen regeln nur die Nutzung des gehosteten Dienstes auf{" "}
          {domain}.
        </p>

        <h2>10. Änderungen, anwendbares Recht</h2>
        <p>
          Wir können diese Bedingungen anpassen; es gilt die jeweils hier veröffentlichte
          Fassung. Es gilt Schweizer Recht. Gerichtsstand ist
          der Wohnsitz des Betreibers, soweit nicht zwingende
          Verbraucherschutzbestimmungen etwas anderes vorsehen.
        </p>
        <LastUpdated lang="de" />
      </>
    );
  }

  return (
    <>
      <h1>Terms of Service</h1>

      <h2>1. Scope</h2>
      <p>
        These terms govern the use of {domain} (“Prompt Battle”, “the service”),
        operated by {op.name}, {op.address}.
      </p>

      <h2>2. The service</h2>
      <p>
        Prompt Battle is a live game: hosts create tournaments, players join on their
        phones with a code and use AI to create images or videos, which are shown and
        voted on in a stage view.
      </p>

      <h2>3. Accounts</h2>
      <p>
        Hosts need an account and must be of legal age or act with the consent of a
        parent or guardian. Keep your credentials secret. Players need no account.
      </p>

      <h2>4. Use and costs</h2>
      <p>The service is free. There are no paid plans.</p>
      <ul>
        <li>
          <strong>Free:</strong> up to {freePlayers} players, image and text tasks, the
          standard image model, {FREE_GAMES_PER_WINDOW} tournament starts per 30 days. The
          operator pays the AI costs within an overall budget; once it is used up, new free
          tournaments can’t be started until the next period. Tournaments already running
          are not affected. We may adjust the free plan’s limits.
        </li>
        <li>
          <strong>Your own API keys:</strong> free. Unlocks up to {ownKeyPlayers} players,
          video tasks and model choice. You pay the AI provider directly for generation and
          are responsible for complying with its terms. We are not liable for costs on your
          provider account.
        </li>
        {donateProvider && (
          <li>
            <strong>Donations:</strong> you may support Prompt Battle with a voluntary
            donation. Donations don’t entitle you to any service or feature and are
            processed by {donateProvider}. If you donated by mistake, we refund it on
            request to {mail} within 14 days.
          </li>
        )}
      </ul>

      <h2>5. Acceptable use</h2>
      <p>
        You may not create illegal, abusive, discriminatory, violent or sexual content,
        content that infringes others’ rights, or content that violates the AI providers’
        usage policies. Hosts are responsible for their event, their tasks and the images
        they upload (which they must have the rights to). We may remove content and
        suspend accounts that break these rules.
      </p>

      <h2>6. Content and AI output</h2>
      <p>
        You keep the rights to content you upload and allow us to store, process and
        display it as needed to run the service. AI-generated content may be unexpected
        or inaccurate; we give no guarantee as to its quality or availability.
      </p>

      <h2>7. Availability</h2>
      <p>
        We aim for reliable operation but do not guarantee uninterrupted availability.
        We recommend a rehearsal in test mode before important events.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the extent permitted by law, our liability for slight negligence is excluded.
        Liability for intent and gross negligence remains unaffected.
      </p>

      <h2>9. Open source</h2>
      <p>
        The source code is available under the AGPL-3.0 on <a href={REPO_URL}>GitHub</a>.
        These terms only govern the use of the hosted service at {domain}.
      </p>

      <h2>10. Changes, governing law</h2>
      <p>
        We may update these terms; the version published here applies. Swiss law
        applies. Place of jurisdiction is the
        operator’s place of residence, unless mandatory consumer protection rules provide
        otherwise.
      </p>
      <LastUpdated lang="en" />
    </>
  );
}
