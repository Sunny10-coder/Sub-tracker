import { useMutation } from "@tanstack/react-query";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { storage } from "@/src/utils/storage";
import { isGoalQuery, recommendToolsForGoal } from "@/src/lib/tool-goal-matcher";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { AppHeader, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";
import { chat as chatDirect, key as savedKey, models as fetchModels, AUTO_NVIDIA_MODEL, geminiSafeDefault, isPaidGeminiModel } from "@/src/lib/direct-providers";
import { getVault } from "@/src/lib/local-vault";
import { METRO } from "@/src/components/metro-tiles";

const SUGGESTIONS = [
  "I want to create a cinematic safety induction video. Which of my tools should I use?",
  "I want to build an Android app using tools I already have.",
  "What renews this month?",
  "How much do I spend every month?",
  "Which trials expire soon?",
  "Which subscriptions overlap?",
  "Show my AI subscriptions",
];

type Msg = { role: "user" | "ai"; text: string; pending?: boolean };

export default function AskAI() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const {ask}=useLocalSearchParams<{ask?:string}>();
  const [preferencesReady,setPreferencesReady]=useState(false);
  const [followUps,setFollowUps]=useState<string[]>([]);

  const [provider,setProvider]=useState<"gemini"|"groq"|"nvidia">("gemini");
  const [available,setAvailable]=useState<string[]>([]);
  const [model,setModel]=useState("");
  const [modelError,setModelError]=useState("");
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      const saved=await storage.getItem("submind.ai.selected-provider","gemini");
      if(!alive)return;
      if(saved==="gemini"||saved==="groq"||saved==="nvidia")setProvider(saved);
      setPreferencesReady(true);
    })();
    return()=>{alive=false};
  },[]);
  useEffect(()=>{
    if(typeof ask==="string"&&ask.trim())setInput(ask.trim());
  },[ask]);
  useEffect(()=>{
    if(!preferencesReady)return;
    let active=true;
    setAvailable([]);setModel("");setModelError("");
    (async()=>{try{
      const list=await fetchModels(provider);
      const allowed=provider==="nvidia"?[AUTO_NVIDIA_MODEL,...list]:list;
      const saved=String(await storage.getItem("submind.ai.selected-model."+provider,"")||"");
      const fallback=provider==="nvidia"?AUTO_NVIDIA_MODEL:
        provider==="gemini"?geminiSafeDefault(list):list[0]||"";
      const chosen=saved&&allowed.includes(saved)?saved:fallback;
      if(active){setAvailable(allowed);setModel(chosen);
        if(!chosen)setModelError("No lower-cost model is accessible. Choose a model explicitly to continue.");
      }
    }catch(e:any){if(active){setModelError(e.message||String(e));setModel(provider==="nvidia"?AUTO_NVIDIA_MODEL:"");}}
    })();
    return()=>{active=false};
  },[provider,preferencesReady]);
  const selectProvider=(p:"gemini"|"groq"|"nvidia")=>{
    setProvider(p);
    storage.setItem("submind.ai.selected-provider",p);
  };
  const selectModel=(next:string)=>{
    setModel(next);
    storage.setItem("submind.ai.selected-model."+provider,next);
  };
  useEffect(() => {
    api.chatHistory().then((h) => {
      const msgs: Msg[] = [];
      h.forEach((row: any) => { msgs.push({ role: "user", text: row.question }); msgs.push({ role: "ai", text: row.answer }); });
      setMessages(msgs);
    }).catch(() => {});
  }, []);

  const chat = useMutation({
    mutationFn: async(q: string) => {
      const v=await getVault();
      if(isGoalQuery(q)){
        const plan=recommendToolsForGoal(v,q);
        return {answer:plan.answer,model:"local-own-tools",followUps:plan.followUps};
      }
      const context="You are SubMind. Use only the provided records for personal facts. Never invent prices, active subscriptions, discounts, or account status. If an answer is unsupported say unknown. Data comes from the user\u0027s local SubMind JSON records. Records: "+JSON.stringify({subscriptions:v.subscriptions.slice(0,120),accounts:v.accounts.slice(0,60),benefits:v.benefits.slice(0,60),links:v.links.slice(0,120).map((l:any)=>({title:l.title,url:l.url,category:l.category,tags:l.tags,summary:l.summary})),promos:v.promo_codes.slice(0,50).map((c:any)=>({provider:c.provider,code:c.code,discount_text:c.discount_text,expiry_date:c.expiry_date,verified:c.verified})),prompts:v.prompts.slice(0,100).map((p:any)=>({title:p.title,category:p.category,tags:p.tags})),watchlist:v.watchlist.slice(0,60)}).slice(0,32000);
      return chatDirect(q,context,provider,model||undefined);
    },
    onMutate: (q) => {
      setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: "", pending: true }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onSuccess: (res) => {
      setFollowUps("followUps" in res && Array.isArray(res.followUps)?res.followUps:[]);
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: res.answer }; return c; });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onError: (error: Error) => {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: error.message+"\nOpen Settings → API Keys to test and configure a provider." }; return c; });
    },
  });

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || chat.isPending) return;
    const execute=()=>{setInput("");chat.mutate(q);};
    if(provider==="gemini" && isPaidGeminiModel(model) && !isGoalQuery(q)){
      Alert.alert("This Gemini model may use paid credits",
        model==="gemini-4-argon"?
          "Gemini 4 Argon has no free API tier. As of October 2026, API usage is $2 per million input and $10 per million output tokens (including reasoning tokens). Send only this message?":
          "This is not a Flash/Lite model. Using it may consume paid API credits. Send only this message?",
        [{text:"Cancel",style:"cancel"},{text:"Use paid model once",onPress:execute}]);
      return;
    }
    execute();
  };

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        setMessages((m) => [...m, { role: "ai", text: "Microphone access is off. Open Settings to enable voice input." }]);
        Linking.openSettings();
      }
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const stopRecording = async () => {
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setTranscribing(true);
    try {
      const res = await api.transcribe(uri);
      if (res.text) setInput((prev) => (prev ? prev + " " : "") + res.text);
    } catch {
      // ignore
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Ask SubMind" subtitle="Direct AI · Your own API key" />
      <View style={{flexDirection:"row",gap:7,paddingHorizontal:16,paddingBottom:10}}>
        {(["gemini","groq","nvidia"] as const).map(p=><Pressable key={p} onPress={()=>selectProvider(p)} style={{flex:1,padding:11,backgroundColor:provider===p?METRO.cyan:"#222",alignItems:"center"}}><Text style={{color:provider===p?METRO.ink:"#fff",fontWeight:"800"}}>{p.toUpperCase()}</Text></Pressable>)}
      </View>
      <View style={{paddingHorizontal:16,paddingBottom:11,gap:7}}>
        <Text style={{color:METRO.white,fontWeight:"900",fontSize:13}}>
          CHOOSE {provider.toUpperCase()} MODEL · {available.length} AVAILABLE
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap:7,paddingVertical:2}}>
          {available.map(m=>{
            const expensive=provider==="gemini"&&isPaidGeminiModel(m);
            return <Pressable key={m} onPress={()=>selectModel(m)}
              style={{backgroundColor:model===m?(expensive?"#68344A":METRO.cobalt):"#2B3041",
                borderWidth:1,borderColor:model===m?(expensive?METRO.orange:METRO.cyan):"#455168",
                borderRadius:10,paddingHorizontal:12,paddingVertical:10,maxWidth:240}}>
              <Text style={{color:METRO.white,fontSize:11,fontWeight:"800"}} numberOfLines={2}>
                {m===AUTO_NVIDIA_MODEL?"Auto · working NVIDIA model":m}
              </Text>
              {provider==="gemini"?<Text style={{color:expensive?"#FFC397":"#A3E4CA",
                fontSize:10,fontWeight:"900",marginTop:4}}>
                {expensive?"PAID · CONFIRM EACH USE":"FLASH / LITE · LOWER COST"}
              </Text>:null}
            </Pressable>;
          })}
        </ScrollView>
        {provider==="gemini"?<Text style={{color:METRO.orange,fontSize:11}}>
          Gemini 4 Argon is never selected automatically. Paid models require confirmation every message.
        </Text>:null}
        {modelError?<Text style={{color:METRO.orange,fontSize:11}}>{modelError}</Text>:null}
      </View>
      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.aiOrb}><Icon name="robot" size={40} color={colors.onBrandPrimary} /></View>
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptySub}>Tell me what you want to achieve. I suggest a workflow using tools already saved in your SubMind vault — free, even without an AI key.</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.suggestion} testID={`suggest-${s}`} onPress={() => send(s)}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
                {item.pending ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <Text style={[styles.bubbleText, { color: item.role === "user" ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{item.text}</Text>
                )}
              </View>
            )}
          />
        )}

        {followUps.length?<ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap:7,paddingHorizontal:15,paddingVertical:9}}>
          {followUps.map(s=><Pressable key={s} onPress={()=>send(s)} style={{backgroundColor:"#2B3550",
            padding:11,borderRadius:9,borderWidth:1,borderColor:"#475F8A"}}>
            <Text style={{color:METRO.white,fontSize:11,fontWeight:"800"}}>{s}</Text>
          </Pressable>)}
        </ScrollView>:null}
        <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 12) + TAB_BAR_SPACE - 40 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              testID="ai-input"
              style={styles.input}
              placeholder={transcribing ? "Transcribing…" : "What do you want to achieve? Ask SubMind…"}
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              multiline
              onSubmitEditing={() => send()}
            />
            <Pressable testID="ai-mic" onPress={recording ? stopRecording : startRecording} style={[styles.micBtn, recording && { backgroundColor: colors.error }]}>
              {transcribing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name={recording ? "stop" : "microphone"} size={20} color={recording ? colors.onError : colors.brandPrimary} />}
            </Pressable>
          </View>
          <Pressable testID="ai-send" onPress={() => send()} disabled={!input.trim() || chat.isPending} style={[styles.sendBtn, { opacity: !input.trim() || chat.isPending ? 0.5 : 1 }]}>
            <Icon name="send" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: METRO.black },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  aiOrb: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  emptySub: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  suggestions: { gap: 8, width: "100%", marginTop: 8 },
  suggestion: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 2, padding: 14 },
  suggestionText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  bubble: { maxWidth: "85%", borderRadius: 2, paddingHorizontal: 16, paddingVertical: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 6 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.surfaceTertiary, borderRadius: 2, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, maxHeight: 120, paddingVertical: 8 },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 48, height: 48, borderRadius: 2, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
