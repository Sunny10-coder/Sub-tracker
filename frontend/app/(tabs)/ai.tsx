import { useMutation } from "@tanstack/react-query";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { AppHeader, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";
import { chat as chatDirect, key as savedKey, models as fetchModels, AUTO_NVIDIA_MODEL } from "@/src/lib/direct-providers";
import { getVault } from "@/src/lib/local-vault";
import { METRO } from "@/src/components/metro-tiles";

const SUGGESTIONS = [
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
  const [provider,setProvider]=useState<"gemini"|"groq"|"nvidia">("gemini");
  const [available,setAvailable]=useState<string[]>([]);
  const [model,setModel]=useState("");
  const [modelError,setModelError]=useState("");
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(()=>{
    let active=true;
    setAvailable([]);setModel(provider==="nvidia"?AUTO_NVIDIA_MODEL:"");setModelError("");
    (async()=>{try {
      const list=await fetchModels(provider);
      if(active){setAvailable(provider==="nvidia"?[AUTO_NVIDIA_MODEL,...list]:list);setModel(provider==="nvidia"?AUTO_NVIDIA_MODEL:list[0]||"");}
    }catch(e:any){if(active){setModelError(e.message||String(e));setModel(provider==="nvidia"?AUTO_NVIDIA_MODEL:"");}}
    })();
    return()=>{active=false};
  },[provider]);
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
      const context="You are SubMind. Use only the provided records for personal facts. Never invent prices, active subscriptions, discounts, or account status. If an answer is unsupported say unknown. Data comes from the user\u0027s local SubMind JSON records. Records: "+JSON.stringify({subscriptions:v.subscriptions.slice(0,120),accounts:v.accounts.slice(0,60),benefits:v.benefits.slice(0,60),links:v.links.slice(0,120).map((l:any)=>({title:l.title,url:l.url,category:l.category,tags:l.tags,summary:l.summary})),promos:v.promo_codes.slice(0,50).map((c:any)=>({provider:c.provider,code:c.code,discount_text:c.discount_text,expiry_date:c.expiry_date,verified:c.verified})),prompts:v.prompts.slice(0,100).map((p:any)=>({title:p.title,category:p.category,tags:p.tags})),watchlist:v.watchlist.slice(0,60)}).slice(0,32000);
      return chatDirect(q,context,provider,model||undefined);
    },
    onMutate: (q) => {
      setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: "", pending: true }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onSuccess: (res) => {
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
    setInput("");
    chat.mutate(q);
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
        {(["gemini","groq","nvidia"] as const).map(p=><Pressable key={p} onPress={()=>setProvider(p)} style={{flex:1,padding:11,backgroundColor:provider===p?METRO.cyan:"#222",alignItems:"center"}}><Text style={{color:provider===p?METRO.ink:"#fff",fontWeight:"800"}}>{p.toUpperCase()}</Text></Pressable>)}
      </View>
      <View style={{paddingHorizontal:16,paddingBottom:9,gap:5}}>
        <Text style={{color:METRO.cyan,fontSize:12,fontWeight:"700"}} numberOfLines={2}>
          Model: {model===AUTO_NVIDIA_MODEL?"Auto · best working NVIDIA agent":model||"No models available"}
        </Text>
        {available.length>1?<Pressable onPress={()=>{const i=available.indexOf(model);setModel(available[(i+1)%available.length])}}>
          <Text style={{color:METRO.white,fontSize:12,fontWeight:"700"}}>CHANGE MODEL ({available.length} choices)</Text>
        </Pressable>:null}
        {modelError?<Text style={{color:METRO.orange,fontSize:11}}>{modelError}</Text>:null}
      </View>
      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.aiOrb}><Icon name="robot" size={40} color={colors.onBrandPrimary} /></View>
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptySub}>I answer using your subscriptions, links, plans and reminders.</Text>
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

        <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 12) + TAB_BAR_SPACE - 40 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              testID="ai-input"
              style={styles.input}
              placeholder={transcribing ? "Transcribing…" : "Ask about your subscriptions…"}
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
