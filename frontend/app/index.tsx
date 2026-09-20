import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { Loading } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";

export default function Index() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    storage.getItem("onboarded", false).then((v) => setSeen(!!v));
  }, []);

  if (seen === null) return <Loading />;
  return <Redirect href={seen ? "/(tabs)" : "/onboarding"} />;
}
