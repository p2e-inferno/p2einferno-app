import Head from "next/head";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { EventsPage } from "@/components/lobby/pages/events-page";

/**
 * EventsIndexPage - Events listing page using modular components
 * Route: /lobby/events
 */
const EventsIndexPage = () => {
  return (
    <>
      <Head>
        <title>Events - P2E Inferno</title>
        <meta name="description" content="Infernal events and competitions" />
      </Head>

      <LobbyLayout>
        <EventsPage />
      </LobbyLayout>
    </>
  );
};

export default EventsIndexPage;
