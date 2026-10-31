import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import { api, useInvalidateAll } from "@/src/lib/api";
import { Icon } from "@/src/components/ui";
import { METRO } from "@/src/components/metro-tiles";

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
export default function HandleShare() {
  const { sharedPayloads, isResolving, clearSharedPayloads, error } = useIncomingShare();
  const [message, setMessage] = useState("Reading Android share…");
  const [saved, setSaved] = useState(false);
  const [linkId, setLinkId] = useState("");
  const last = useRef("");
  const router = useRouter();
  const invalidate = useInvalidateAll();
  useEffect(() => {
    if (isResolving || !sharedPayloads.length) return;
    const text = sharedPayloads.map(x => String(x.value || "")).join(" ");
    const raw = text.match(URL_IN_TEXT)?.[0]?.replace(/[),.;]+$/, "");
    if (!raw) { setMessage("No website URL was found in the shared text. You can paste it manually."); return; }
    if (last.current === text) return;
    last.current = text;
    setMessage("Classifying and saving link on this phone…");
    api.ingestLink(raw, "share", text.replace(raw, "").trim().slice(0, 500))
      .then(r => {
        setSaved(true);setLinkId(r.link_id);setMessage(r.duplicate ? "Already in Link Vault" : "Saved and categorised");
        invalidate();clearSharedPayloads();
      })
      .catch(e => { last.current = "";setMessage(String(e?.message || "Could not save link")); });
  }, [sharedPayloads, isResolving, invalidate, clearSharedPayloads]);
  return <View style={{flex:1,backgroundColor:METRO.black,justifyContent:"center",alignItems:"center",padding:30,gap:18}}>
    <Icon name={saved ? "check-circle" : "bookmark-plus-outline"} size={68} color={saved ? METRO.green : METRO.cyan}/>
    {!saved && isResolving ? <ActivityIndicator color={METRO.cyan}/> : null}
    <Text style={{color:METRO.white,fontSize:27,fontWeight:"900",textAlign:"center"}}>SUBMIND LINK VAULT</Text>
    <Text style={{color:METRO.dim,fontSize:15,textAlign:"center",lineHeight:22}}>{error?.message || message}</Text>
    {saved && linkId ? <Pressable onPress={() => router.replace(("/link/" + encodeURIComponent(linkId)) as any)}
      style={{backgroundColor:METRO.cyan,padding:16,width:"100%",alignItems:"center"}}>
      <Text style={{color:METRO.ink,fontWeight:"900"}}>OPEN SAVED LINK</Text>
    </Pressable> : null}
    <Pressable onPress={() => router.replace(saved ? "/(tabs)/vault" : "/paste-link")}
      style={{padding:14,borderWidth:1,borderColor:METRO.dim,width:"100%",alignItems:"center"}}>
      <Text style={{color:METRO.white,fontWeight:"800"}}>{saved ? "BACK TO VAULT" : "PASTE MANUALLY"}</Text>
    </Pressable>
  </View>;
}
