import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DailyQuestsIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    void router.replace("/lobby/quests?tab=daily");
  }, [router]);

  return null;
}
