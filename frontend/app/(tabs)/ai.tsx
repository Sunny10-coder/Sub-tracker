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
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    api.chatHistory().then((h) => {
      const msgs: Msg[] = [];
      h.forEach((row: any) => { msgs.push({ role: "user", text: row.question }); msgs.push({ role: "ai", text: row.answer }); });
      setMessages(msgs);
    }).catch(() => {});
  }, []);

  const chat = useMutation({
    mutationFn: (q: string) => api.chat(q),
    onMutate: (q) => {
      setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: "", pending: true }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onSuccess: (res) => {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: res.answer }; return c; });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onError: () => {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: "Sorry, I couldn't answer that. Please try again." }; return c; });
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
      <AppHeader title="Ask SubMind" subtitle="Answers from your own data" />
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
  container: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  aiOrb: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  emptySub: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  suggestions: { gap: 8, width: "100%", marginTop: 8 },
  suggestion: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  suggestionText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  bubble: { maxWidth: "85%", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 6 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.surfaceTertiary, borderRadius: 22, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, maxHeight: 120, paddingVertical: 8 },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
