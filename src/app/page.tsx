import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "FleetFalcon | Fleet maintenance for small businesses",
  description:
    "Keep vehicle details, mileage, maintenance schedules and service history together. FleetFalcon helps small fleets see what needs attention next.",
};

export default function HomePage() {
  return (
    <main className={styles.landing}>
      <nav className={styles.navigation} aria-label="Main navigation">
        <span className={styles.brand}>FleetFalcon</span>
        <Link href="/organizations">Your organizations</Link>
        <Link href="/auth">Sign in</Link>
      </nav>
      <section className={styles.hero} aria-labelledby="welcome-heading">
        <p className={styles.eyebrow}>For small fleets with a lot to do</p>
        <h1 id="welcome-heading">
          Less spreadsheet work. More clarity on maintenance.
        </h1>
        <p className={styles.introduction}>
          Your vehicles, mileage and service history in one place. See what
          needs attention and keep the next service in view.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/auth">
            Get started
          </Link>
          <a href="#how-it-works">See how it works</a>
        </div>
        <p className={styles.note}>
          Built around the everyday work of owners and fleet managers.
        </p>
      </section>
      <section
        className={styles.capabilities}
        aria-labelledby="capabilities-heading"
      >
        <p className={styles.eyebrow}>A clear record. A practical next step.</p>
        <h2 id="capabilities-heading">Keep the essentials together.</h2>
        <div className={styles.cards}>
          <article>
            <span className={styles.number}>01</span>
            <h3>Know your vehicles</h3>
            <p>
              Keep names, VINs and vehicle details organized. Archive a vehicle
              without losing its history.
            </p>
          </article>
          <article>
            <span className={styles.number}>02</span>
            <h3>See what is due</h3>
            <p>
              Track mileage and time-based maintenance. Review overdue, due and
              upcoming service from your dashboard.
            </p>
          </article>
          <article>
            <span className={styles.number}>03</span>
            <h3>Keep the service record</h3>
            <p>
              Record completed work, shop details and costs. Update selected
              schedules and keep a history of corrections.
            </p>
          </article>
        </div>
      </section>
      <section
        id="how-it-works"
        className={styles.gettingStarted}
        aria-labelledby="steps-heading"
      >
        <div>
          <p className={styles.eyebrow}>From first vehicle to next service</p>
          <h2 id="steps-heading">Start with the fleet you have.</h2>
          <p>
            Use the online management tools in your browser. An internet
            connection is required to confirm saves.
          </p>
        </div>
        <ol>
          <li>
            <strong>Create your organization.</strong> Sign up, confirm your
            email, and give your fleet a home.
          </li>
          <li>
            <strong>Add a vehicle and its starting mileage.</strong> Choose
            miles or kilometers and keep the vehicle details close at hand.
          </li>
          <li>
            <strong>Set a schedule, then record the work.</strong> Review your
            dashboard and record service when it is complete.
          </li>
        </ol>
      </section>
      <footer className={styles.footer}>
        <p>Ready to put your maintenance records in order?</p>
        <Link href="/auth">Sign up or sign in</Link>
      </footer>
    </main>
  );
}
